import { runTask } from './loop.mjs';
import { createChatGPTDriver, ComputerUseRuntimeError, RUNTIME_SOURCE } from './chatgpt-driver.mjs';
import { prepareWindowsStep } from './windows-harness.mjs';
import { VERSION } from './version.mjs';
export { VERSION } from './version.mjs';
export { inspectWindowsRuntime } from './windows-driver.mjs';
export { executeWindowsStep } from './windows-harness.mjs';
export { inspectChatGPTRuntime } from './chatgpt-driver.mjs';

/** GPT is the sole planner/owner. Jev retains target/action/done/risk selection.
 * The original bounded loop is invoked inside the official desktop tool runtime.
 * This entry does not create that runtime and cannot run from ordinary Node alone.
 */
export async function runChatGPTTask(input = {}) {
  const allowed = new Set(['cua', 'sky', 'windowId', 'appName', 'goal', 'dryRun', 'maxSteps', 'candidateMax', 'allowedApps', 'resources', 'constraints', 'plan', 'verify', 'emit', 'traceDir', 'traceId', 'signal']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new Error(`Unsupported option: ${key}. Alternate drivers, model overrides and policy-threshold overrides are not accepted by this entry.`);
  const { cua, sky, windowId, signal, resources = {}, ...options } = input;
  if (cua != null && sky != null) throw new Error('Choose one official runtime: cua or sky.');
  if (sky == null && windowId !== undefined) throw new Error('windowId requires sky.');
  if (sky != null && options.maxSteps !== undefined && options.maxSteps !== 1) throw new Error('Windows requires maxSteps: 1; inspect each proposal in a separate tool cell.');
  if (typeof options.appName !== 'string' || !options.appName.trim() || typeof options.goal !== 'string' || !options.goal.trim()) throw new Error('appName and goal are required');
  if (options.dryRun !== undefined && typeof options.dryRun !== 'boolean') throw new Error('dryRun must be boolean');
  for (const [key, max] of [['maxSteps', 30], ['candidateMax', 40]]) {
    if (options[key] !== undefined && (!Number.isInteger(options[key]) || options[key] < 1 || options[key] > max)) throw new Error(`${key} must be an integer from 1 to ${max}`);
  }
  if (options.allowedApps !== undefined && (!Array.isArray(options.allowedApps) || !options.allowedApps.every(n => typeof n === 'string' && n.trim()))) throw new Error('allowedApps must be explicit app names; it is not host permission');
  if (options.verify !== undefined && typeof options.verify !== 'function') throw new Error('verify must be a host-owned function');
  const checkedResources = async (step, decision) => {
    signal?.throwIfAborted();
    const r = typeof resources === 'function' ? await resources(step, decision) : resources;
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('resources must return an object');
    if (decision) {
      if (['click_at', 'drag'].includes(decision.action) || r.at !== undefined || r.from !== undefined || r.to !== undefined) throw new Error('Coordinate actions require GPT takeover through official Computer Use, not an AX-target override');
      if (['set_value', 'type_text'].includes(decision.action) && typeof r.text !== 'string') throw new Error('GPT must supply explicit text; no implicit empty-string replacement');
      if (decision.action === 'press_key' && (typeof r.key !== 'string' || !r.key.trim())) throw new Error('GPT must supply an explicit key; no implicit Return');
      if (decision.action === 'scroll' && !['up', 'down', 'left', 'right'].includes(r.direction)) throw new Error('GPT must supply explicit scroll direction');
    }
    return r;
  };
  let dispatchedActions = 0;
  try {
    if (sky != null) return await prepareWindowsStep({ ...options, sky, windowId, signal, resources: checkedResources });
    const driver = createChatGPTDriver(cua, { signal });
    const guarded = { ...driver };
    for (const name of ['click', 'drag', 'setValue', 'typeText', 'pressKey', 'scroll']) {
      guarded[name] = async (...args) => { signal?.throwIfAborted(); dispatchedActions++; return driver[name](...args); };
    }
    const result = await runTask({ ...options, driver: guarded, resources: checkedResources });
    return { ...result, harnessVersion: VERSION, runtime: RUNTIME_SOURCE, fallback: 'none' };
  } catch (err) {
    // Do not echo callbacks, private UI data or host/provider error text.
    const cancelled = Boolean(signal?.aborted);
    return {
      status: err instanceof ComputerUseRuntimeError ? 'escalate' : cancelled ? 'stop' : 'error',
      reason: err instanceof ComputerUseRuntimeError ? err.code : cancelled ? 'cancelled' : 'harness_or_host_error',
      runtime: RUNTIME_SOURCE, harnessVersion: VERSION, fallback: 'none',
      actionOutcome: dispatchedActions ? 'unknown_reobserve_before_retry' : 'no_action_dispatched',
      message: 'Return control to GPT in the same ChatGPT desktop session. Inspect official tool documentation/permissions and current state; do not use an alternate executor.',
    };
  }
}

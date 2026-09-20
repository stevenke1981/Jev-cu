import { runTask } from './loop.mjs';
import { createWindowsDriver } from './windows-driver.mjs';
import { ComputerUseRuntimeError, RUNTIME_SOURCE } from './chatgpt-driver.mjs';
import { VERSION } from './version.mjs';
import fs from 'node:fs';

const pending = new WeakMap();
const supported = new Set(['click_element', 'set_value', 'type_text', 'press_key']);
const metadata = { harnessVersion: VERSION, runtime: RUNTIME_SOURCE, interface: 'sky-window2', fallback: 'none' };
const failure = (err, dispatched = false) => ({
  ...metadata, status: err instanceof ComputerUseRuntimeError ? 'escalate' : 'error',
  reason: err instanceof ComputerUseRuntimeError ? err.code : 'harness_or_host_error',
  actionOutcome: dispatched ? 'unknown_reobserve_before_retry' : 'no_action_dispatched',
});

// Windows tool guidance requires separate observe/review and action cells.
// Never run the legacy automatic loop with a Windows input driver.
export async function prepareWindowsStep({ sky, windowId, signal, resources, ...options }) {
  const driver = createWindowsDriver(sky, { windowId, signal });
  const result = await runTask({ ...options, driver, resources, dryRun: true, maxSteps: 1 });
  signal?.throwIfAborted();
  const observation = driver.snapshot();
  if (result.status !== 'dry_run' || !result.decision || result.gate?.verdict !== 'proceed') {
    return { ...result, ...metadata, observation };
  }
  const decision = result.decision;
  if (!supported.has(decision.action)) return { ...result, ...metadata, observation, status: 'escalate', reason: 'official_action_requires_takeover' };
  const r = await resources(1, decision);
  const action = Object.freeze({
    action: decision.action, targetIndex: decision.targetIndex, targetLabel: decision.targetLabel,
    ...(['set_value', 'type_text'].includes(decision.action) ? { text: r.text } : {}),
    ...(decision.action === 'press_key' ? { key: r.key } : {}),
    ...(decision.action === 'click_element' ? { mouseButton: r.mouseButton ?? 'left' } : {}),
  });
  const proposal = Object.freeze({ ...result, ...metadata, observation, planned: action,
    status: options.dryRun === false ? 'awaiting_review' : 'dry_run',
    message: 'Print and inspect observation/planned in this tool cell. Execute at most one action in a separate cell; reprepare after any interleaving or UI change.',
  });
  if (options.dryRun === false) pending.set(proposal, { driver, action, signal, tracePath: result.tracePath, verify: options.verify, expires: Date.now() + 120_000 });
  return proposal;
}

export async function executeWindowsStep(proposal) {
  const step = proposal && pending.get(proposal);
  if (!step) return { ...metadata, status: 'escalate', reason: 'invalid_or_consumed_proposal', actionOutcome: 'no_action_dispatched' };
  pending.delete(proposal); // Single use, even after cancellation, failure or expiry.
  const record = result => {
    fs.appendFileSync(step.tracePath, JSON.stringify({ ts: new Date().toISOString(), event: 'windows_action',
      action: step.action.action, targetIndex: step.action.targetIndex, status: result.status,
      verified: result.verified ?? false, actionOutcome: result.actionOutcome }) + '\n');
    return { ...result, tracePath: step.tracePath };
  };
  let dispatched = false;
  try {
    step.signal?.throwIfAborted();
    if (Date.now() > step.expires) throw new ComputerUseRuntimeError('stale_proposal', 'Observe and review again.');
    const { driver: d, action: a } = step;
    d.snapshot(); // Reject observations superseded by another preparation.
    dispatched = true;
    switch (a.action) {
      case 'click_element': await d.click(a.targetIndex, { mouseButton: a.mouseButton }); break;
      case 'set_value': await d.setValue(a.targetIndex, a.text); break;
      case 'type_text': await d.typeText(a.text, a.targetIndex); break;
      case 'press_key': await d.pressKey(a.key); break;
    }
    const tree = await d.observe(); // One action, then immediate fresh observation.
    const verified = step.verify ? Boolean(await step.verify(tree)) : false;
    return record({ ...metadata, status: verified ? 'done' : 'step_complete', verified,
      steps: 1, observation: d.snapshot(), actionOutcome: 'executed_and_observed' });
  } catch (err) {
    const result = { ...failure(err, dispatched), ...(step.signal?.aborted ? { status: 'stop', reason: 'cancelled' } : {}) };
    try { return record(result); } catch { return { ...result, traceWriteFailed: true }; }
  }
}

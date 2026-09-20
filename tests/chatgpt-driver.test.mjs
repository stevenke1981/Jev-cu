import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatGPTDriver, inspectChatGPTRuntime } from '../scripts/chatgpt-driver.mjs';
function mock() {
  const calls = [];
  const app = { async getAXState(options) { assert.equal(this, app); calls.push(['observe', options]); return '0 standard window Calendar\n1 button Next'; } };
  for (const name of ['click', 'drag', 'setValue', 'typeText', 'pressKey', 'scroll']) app[name] = async function (...args) { assert.equal(this, app); calls.push([name, ...args]); };
  const cua = { async getApp(name) { calls.push(['bind', name]); return app; } };
  return { calls, app, cua };
}
test('no runtime: explicit failure without any fallback', () => {
  assert.equal(inspectChatGPTRuntime(null).compatibleEntryPoint, false);
  assert.throws(() => createChatGPTDriver(null), e => e.code === 'official_computer_use_unavailable');
});
test('inspect is a local shape check and never invokes desktop methods', () => {
  const m = mock(); assert.equal(inspectChatGPTRuntime(m.cua).compatibleEntryPoint, true); assert.equal(m.calls.length, 0);
});
test('real injected App object receives full-state reads and bound calls', async () => {
  const m = mock(); const d = createChatGPTDriver(m.cua); await d.bind('Calendar');
  await d.observe({ full: true }); await d.click(1); await d.setValue(2, '繁體中文'); await d.typeText('literal'); await d.pressKey('Return'); await d.scroll(1, 'down', 1);
  assert.deepEqual(m.calls[1], ['observe', { emit: false, disableDiffing: true }]);
  assert.deepEqual(m.calls.map(c => c[0]), ['bind', 'observe', 'click', 'setValue', 'typeText', 'pressKey', 'scroll']);
});
test('missing official AX method does not synthesize observations', async () => {
  const d = createChatGPTDriver({ getApp: async () => ({ screenshot: async () => ({}) }) });
  await assert.rejects(d.bind('App'), e => e.code === 'official_state_interface_unsupported');
});
test('non-text state is not silently turned into AX', async () => {
  const d = createChatGPTDriver({ getApp: async () => ({ getAXState: async () => ({ nodes: [] }) }) });
  await d.bind('App'); await assert.rejects(d.observe(), e => e.code === 'official_state_format_unsupported');
});
test('missing action method fails rather than substituting keys/clicks', async () => {
  const d = createChatGPTDriver({ getApp: async () => ({ getAXState: async () => 'state' }) });
  await d.bind('App'); await assert.rejects(d.click(1), e => e.code === 'official_method_unavailable');
});
test('host permission errors propagate without retry/elevation', async () => {
  let calls = 0; const d = createChatGPTDriver({ getApp: async () => { calls++; throw new Error('host permission denied'); } });
  await assert.rejects(d.bind('App'), /permission denied/); assert.equal(calls, 1);
});
test('cancellation blocks all subsequent actions', async () => {
  const m = mock(); const c = new AbortController(); const d = createChatGPTDriver(m.cua, { signal: c.signal });
  await d.bind('Calendar'); c.abort(); await assert.rejects(d.click(1)); assert.deepEqual(m.calls.map(c => c[0]), ['bind']);
});
test('coordinate override and drag never dispatch from AX harness', async () => {
  const m = mock(); const d = createChatGPTDriver(m.cua); await d.bind('Calendar');
  await assert.rejects(d.click([2, 3]), e => e.code === 'unbound_coordinate_action');
  await assert.rejects(d.drag([1, 2], [3, 4]), e => e.code === 'unbound_coordinate_action');
  assert.equal(m.calls.length, 1);
});
test('calls before bind fail clearly', async () => { await assert.rejects(createChatGPTDriver(mock().cua).observe(), e => e.code === 'app_not_bound'); });

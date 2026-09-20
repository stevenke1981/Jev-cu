import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWindowsDriver, inspectWindowsRuntime } from '../scripts/windows-driver.mjs';
import { runChatGPTTask, executeWindowsStep } from '../scripts/chatgpt-harness.mjs';

function fixture() {
  const window = { app: 'paint-app', id: 42, title: 'Untitled' };
  const events = [];
  const state = { window, accessibility: { tree: '0 window Paint\n1 button View\n2 button Home\n3 text field Search', focused_element: '3 text field Search' }, screenshots: [{ url: 'private-image' }] };
  const sky = {
    target: 'windows',
    async list_apps() { assert.equal(this, sky); events.push(['list']); return [{ id: window.app, displayName: 'Paint', windows: [window] }]; },
    async get_window_state(args) { assert.equal(this, sky); assert.deepEqual(args, { window, include_screenshot: false, include_text: true }); events.push(['observe']); return state; },
  };
  for (const method of ['click', 'set_value', 'type_text', 'press_key']) sky[method] = async function(args) {
    assert.equal(this, sky); events.push([method, args]); state.accessibility.tree += '\n4 text Result: complete';
  };
  return { sky, window, state, events };
}
async function model(t, options = {}, answer = {}) {
  const f = fixture(), traceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-win-'));
  const oldFetch = globalThis.fetch, oldKey = process.env.OPENROUTER_API_KEY;
  t.after(() => { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey; fs.rmSync(traceDir, { recursive: true, force: true }); });
  const requests = [];
  process.env.OPENROUTER_API_KEY = 'test-only';
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://openrouter.ai/api/alpha/decisions');
    const body = JSON.parse(init.body); requests.push(body);
    assert.equal(body.model, 'typesafe/jev-1.13');
    assert.deepEqual(Object.keys(body.questions), ['target', 'action', 'done', 'risk']);
    assert.equal(init.body.includes('private-image'), false);
    return new Response(JSON.stringify({ answers: { target: { choice: 'i1', confidence: 0.99 }, action: { choice: 'click_element' }, done: { noul: 0.01 }, risk: { noul: 0.01 }, ...answer }, usage: { cost: 0 } }));
  };
  const input = { sky: f.sky, appName: 'Paint', allowedApps: ['Paint'], goal: 'Open View', traceDir, emit: () => {}, ...options };
  return { ...f, requests, input, proposal: await runChatGPTTask(input) };
}

test('Windows binds one returned window and preserves official tree and indexes', async () => {
  const f = fixture(), d = createWindowsDriver(f.sky, { windowId: 42 });
  assert.equal(inspectWindowsRuntime(f.sky).compatibleEntryPoint, true);
  await d.bind('Paint'); assert.equal(await d.observe(), f.state.accessibility.tree);
  await d.click(1);
  assert.deepEqual(f.events.at(-1), ['click', { window: f.window, element_index: 1, mouse_button: 'left' }]);
  await assert.rejects(d.click(1), e => e.code === 'stale_observation');
});
test('Windows ambiguity, absent window and changed identity never cause input', async () => {
  const f = fixture();
  f.sky.list_apps = async () => [{ id: 'paint-app', displayName: 'Paint', windows: [f.window, { ...f.window, id: 43 }] }];
  await assert.rejects(createWindowsDriver(f.sky).bind('Paint'), e => e.code === 'ambiguous_window');
  await assert.rejects(createWindowsDriver(f.sky, { windowId: 99 }).bind('Paint'), e => e.code === 'ambiguous_window');
  const d = createWindowsDriver(f.sky, { windowId: 42 }); await d.bind('Paint');
  f.state.window = { ...f.window, id: 999 };
  await assert.rejects(d.observe(), e => e.code === 'window_changed');
  await assert.rejects(d.click(1), e => e.code === 'stale_observation');
});
test('Windows screenshot-only observations and unobserved targets cannot generate clicks', async () => {
  const f = fixture(), d = createWindowsDriver(f.sky); await d.bind('Paint'); await d.observe();
  for (const index of [undefined, -1, 999, [1, 2]]) await assert.rejects(d.click(index), e => e.code === 'unobserved_target');
  f.state.accessibility = null;
  await assert.rejects(d.observe(), e => e.code === 'official_state_format_unsupported');
  await assert.rejects(d.click(1), e => e.code === 'stale_observation');
});
test('Windows maps explicit text and keys, rejects unknown focus and coordinate actions', async () => {
  const f = fixture(), d = createWindowsDriver(f.sky); await d.bind('Paint'); await d.observe();
  await assert.rejects(d.typeText('abc', 1), e => e.code === 'focus_unverified');
  await d.typeText('繁體中文', 3); assert.equal(f.events.at(-1)[0], 'type_text');
  await d.observe(); await d.setValue(3, 'text'); assert.equal(f.events.at(-1)[1].element_index, 3);
  await d.observe();
  for (const key of ['Win+r', 'Meta_L', 'Ctrl+Super_L', '']) await assert.rejects(d.pressKey(key));
  await assert.rejects(d.scroll(1, 'down', 1), e => e.code === 'official_action_requires_takeover');
  await assert.rejects(d.drag(), e => e.code === 'official_action_requires_takeover');
  await d.pressKey('Escape'); assert.equal(f.events.at(-1)[1].key, 'Escape');
});
test('Windows action failure invalidates the observation and never retries input', async () => {
  const f = fixture(); let count = 0;
  f.sky.click = async () => { count++; throw new Error('permission denied'); };
  const d = createWindowsDriver(f.sky); await d.bind('Paint'); await d.observe();
  await assert.rejects(d.click(1), /permission denied/);
  await assert.rejects(d.click(1), e => e.code === 'stale_observation'); assert.equal(count, 1);
});
test('Windows dry-run calls Jev without input and is not executable', async t => {
  const f = await model(t);
  assert.equal(f.proposal.status, 'dry_run'); assert.equal(f.requests.length, 1);
  assert.deepEqual(f.events.map(e => e[0]), ['list', 'observe']);
  assert.equal((await executeWindowsStep(f.proposal)).reason, 'invalid_or_consumed_proposal');
});
test('Windows real mode waits for a separate review call, acts once, refreshes and verifies', async t => {
  const f = await model(t, { dryRun: false, verify: ax => ax.includes('Result: complete') });
  assert.equal(f.proposal.status, 'awaiting_review'); assert.equal(f.events.length, 2);
  const result = await executeWindowsStep(f.proposal);
  assert.equal(result.status, 'done'); assert.equal(result.verified, true);
  const trace = fs.readFileSync(result.tracePath, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(trace.at(-1).event, 'windows_action'); assert.equal(trace.at(-1).verified, true);
  assert.deepEqual(f.events.map(e => e[0]), ['list', 'observe', 'click', 'observe']);
  assert.equal((await executeWindowsStep(f.proposal)).reason, 'invalid_or_consumed_proposal');
});
test('Windows proposals cannot be copied, overridden or used after another observation', async t => {
  const f = await model(t, { dryRun: false });
  assert.equal((await executeWindowsStep({ ...f.proposal })).reason, 'invalid_or_consumed_proposal');
  assert.throws(() => { f.proposal.planned.targetIndex = 2; });
  await runChatGPTTask(f.input);
  assert.equal((await executeWindowsStep(f.proposal)).reason, 'stale_observation');
  assert.equal(f.events.some(e => e[0] === 'click'), false);
});
test('Windows cancellation between review and action prevents dispatch', async t => {
  const controller = new AbortController();
  const f = await model(t, { dryRun: false, signal: controller.signal }); controller.abort();
  const result = await executeWindowsStep(f.proposal);
  assert.equal(result.reason, 'cancelled'); assert.equal(result.actionOutcome, 'no_action_dispatched');
});
test('Windows sensitive risk remains confirmation-only and cannot be executed', async t => {
  const f = await model(t, { dryRun: false }, { risk: { noul: 0.8 } });
  assert.equal(f.proposal.status, 'confirm');
  assert.equal((await executeWindowsStep(f.proposal)).reason, 'invalid_or_consumed_proposal');
});
test('Windows rejects coordinates and missing explicit input before making a proposal executable', async t => {
  const f = await model(t, { dryRun: false, resources: { at: [1, 2] } });
  assert.equal(f.proposal.status, 'error'); assert.equal(f.events.some(e => e[0] === 'click'), false);
});
test('Windows cannot automatically loop or mix runtime objects', async () => {
  await assert.rejects(runChatGPTTask({ sky: fixture().sky, appName: 'Paint', goal: 'view', maxSteps: 2 }), /maxSteps: 1/);
  await assert.rejects(runChatGPTTask({ sky: fixture().sky, cua: {}, appName: 'Paint', goal: 'view' }), /Choose one/);
});
test('Windows expired proposals do not dispatch and cannot be replayed', async t => {
  const f = await model(t, { dryRun: false });
  const now = Date.now; t.after(() => { Date.now = now; }); Date.now = () => now() + 121_000;
  const result = await executeWindowsStep(f.proposal);
  assert.equal(result.reason, 'stale_proposal'); assert.equal(result.actionOutcome, 'no_action_dispatched');
  assert.equal((await executeWindowsStep(f.proposal)).reason, 'invalid_or_consumed_proposal');
});
test('Windows failed refresh never claims success or repeats the input', async t => {
  const f = await model(t, { dryRun: false });
  f.sky.get_window_state = async () => { throw new Error('capture failed'); };
  const result = await executeWindowsStep(f.proposal);
  assert.equal(result.status, 'error'); assert.equal(result.actionOutcome, 'unknown_reobserve_before_retry');
  assert.equal((await executeWindowsStep(f.proposal)).reason, 'invalid_or_consumed_proposal');
  assert.equal(f.events.filter(e => e[0] === 'click').length, 1);
});
test('Windows verified goal avoids model calls and input entirely', async t => {
  const f = await model(t, { dryRun: false, verify: () => true });
  assert.equal(f.proposal.status, 'done'); assert.equal(f.proposal.verified, true); assert.equal(f.requests.length, 0);
  assert.equal((await executeWindowsStep(f.proposal)).reason, 'invalid_or_consumed_proposal');
});
test('Windows input without explicit text is not executable', async t => {
  const f = await model(t, { dryRun: false }, { action: { choice: 'set_value' } });
  assert.equal(f.proposal.status, 'error');
  assert.equal((await executeWindowsStep(f.proposal)).reason, 'invalid_or_consumed_proposal');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runChatGPTTask } from '../scripts/chatgpt-harness.mjs';
const AX = 'Window: "Calendar", App: Calendar.\n0 standard window Calendar\n1 button previous month\n2 button next month\n3 text Value: September 2026';
const answers = { target: { choice: 'i2', confidence: 0.98 }, action: { choice: 'click_element' }, done: { noul: 0.01 }, risk: { noul: 0.01 } };
async function scenario(t, options = {}, response = answers) {
  const traceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-gpt-loop-'));
  const prevKey = process.env.OPENROUTER_API_KEY, prevFetch = globalThis.fetch;
  const events = [], requests = [];
  let state = AX;
  t.after(() => { globalThis.fetch = prevFetch; if (prevKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prevKey; fs.rmSync(traceDir, { recursive: true, force: true }); });
  process.env.OPENROUTER_API_KEY = 'test-key-not-a-real-secret';
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://openrouter.ai/api/alpha/decisions');
    const body = JSON.parse(init.body); assert.equal(body.model, 'typesafe/jev-1.13'); requests.push(body); events.push('jev-four-questions');
    return new Response(JSON.stringify({ answers: response, model: body.model, usage: { input_tokens: 100, cost: 0 } }));
  };
  const app = { getAXState: async () => { events.push('observe'); return state; }, click: async index => { assert.equal(index, 2); events.push('official-click'); state = AX.replace('September', 'October'); } };
  const cua = { getApp: async () => { events.push('bind-official-app'); return app; } };
  const result = await runChatGPTTask({ cua, appName: 'Calendar', goal: 'Go to next month', traceDir, emit: () => {}, maxSteps: 1, ...options });
  return { result, events, requests };
}
test('ChatGPT entry: four-question dry-run preserves original flow and does not click', async t => {
  const { result, events, requests } = await scenario(t);
  assert.equal(result.status, 'dry_run'); assert.equal(result.fallback, 'none');
  assert.deepEqual(Object.keys(requests[0].questions), ['target', 'action', 'done', 'risk']);
  assert.deepEqual(events, ['bind-official-app', 'observe', 'jev-four-questions']);
});
test('ChatGPT entry: original harness executes via official App then verifies new AX', async t => {
  const { result, events } = await scenario(t, { dryRun: false, verify: ax => ax.includes('October') });
  assert.equal(result.status, 'done'); assert.equal(result.verified, true);
  assert.deepEqual(events, ['bind-official-app', 'observe', 'jev-four-questions', 'official-click', 'observe']);
});
test('ChatGPT entry: missing runtime does not fall back or call the model', async t => {
  const { result, requests } = await scenario(t, { cua: null });
  assert.equal(result.reason, 'official_computer_use_unavailable'); assert.equal(requests.length, 0);
});
test('ChatGPT entry: unsupported state interface stops without synthesizing AX', async t => {
  const { result, requests } = await scenario(t, { cua: { getApp: async () => ({}) } });
  assert.equal(result.reason, 'official_state_interface_unsupported'); assert.equal(requests.length, 0);
});
test('ChatGPT entry: window-only observation escalates rather than inventing buttons', async t => {
  const { result, requests } = await scenario(t, { cua: { getApp: async () => ({ getAXState: async () => '0 standard window CapCut' }) } });
  assert.equal(result.status, 'escalate'); assert.equal(requests.length, 0);
});
test('ChatGPT entry: low target confidence keeps original stop threshold', async t => {
  const { result, events } = await scenario(t, { dryRun: false }, { ...answers, target: { choice: 'i2', confidence: 0.2 } });
  assert.equal(result.status, 'stop'); assert.equal(events.includes('official-click'), false);
});
test('ChatGPT entry: model done cannot override failed host verification', async t => {
  const { result } = await scenario(t, { dryRun: false, verify: () => false }, { ...answers, done: { noul: 0.99 } });
  assert.equal(result.status, 'escalate');
});
test('ChatGPT entry: policy, provider and driver cannot be overridden through entry options', async () => {
  for (const key of ['driver', 'decide', 'thresholds', 'jevOptions']) await assert.rejects(runChatGPTTask({ appName: 'Calendar', goal: 'next', [key]: {} }), /Unsupported option/);
});
test('ChatGPT entry: coordinate override never reaches official click', async t => {
  const { result, events } = await scenario(t, { dryRun: false, resources: { at: [50, 60] } });
  assert.equal(result.status, 'error'); assert.equal(events.includes('official-click'), false);
});
test('ChatGPT entry: skipJev cannot bypass policy into real input', async t => {
  const { result, requests, events } = await scenario(t, { dryRun: false, resources: { skipJev: true, action: 'type_text', text: 'test' } });
  assert.equal(result.status, 'escalate'); assert.equal(requests.length, 0); assert.equal(events.includes('official-click'), false);
});

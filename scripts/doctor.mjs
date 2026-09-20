#!/usr/bin/env node
import { loadApiKey, DEFAULT_MODEL, DEFAULT_ENDPOINT } from './jev-decide.mjs';
import { VERSION } from './version.mjs';
let keyConfigured = false;
try { keyConfigured = Boolean(loadApiKey()); } catch { /* Never output secrets. */ }
console.log(JSON.stringify({ version: VERSION, planner: 'GPT in ChatGPT desktop', executor: 'official Computer Use plugin only',
  supportedInterfaces: ['cua-app', 'sky-window2'], windowsExecution: 'observe_review_then_single_action',
  protocol: ['target', 'action', 'done', 'risk'], model: DEFAULT_MODEL, endpoint: DEFAULT_ENDPOINT, keyConfigured,
  desktopRuntime: 'not_inspected_in_plain_node', fallback: 'none',
  note: 'This command does not open apps, call Jev, install plugins, or prove desktop connectivity. Use runChatGPTTask inside the actual official tool runtime.' }, null, 2));

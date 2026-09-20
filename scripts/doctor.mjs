#!/usr/bin/env node
import { loadApiKey, DEFAULT_MODEL, DEFAULT_ENDPOINT } from './jev-decide.mjs';
let keyConfigured = false;
try { keyConfigured = Boolean(loadApiKey()); } catch { /* Never output secrets. */ }
console.log(JSON.stringify({ version: '0.4.0', planner: 'GPT in ChatGPT desktop', executor: 'official Computer Use plugin only',
  protocol: ['target', 'action', 'done', 'risk'], model: DEFAULT_MODEL, endpoint: DEFAULT_ENDPOINT, keyConfigured,
  desktopRuntime: 'not_inspected_in_plain_node', fallback: 'none',
  note: 'This command does not open apps, call Jev, install plugins, or prove desktop connectivity. Use runChatGPTTask inside the actual official tool runtime.' }, null, 2));

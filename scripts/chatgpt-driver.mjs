/** Adapter for the existing cua App contract INSIDE ChatGPT desktop Computer Use.
 * This is not a desktop driver, MCP server, plugin loader, or provenance check.
 * Read the current official tool documentation before injecting its real cua object.
 */
export const RUNTIME_SOURCE = 'chatgpt-desktop-computer-use';
export const REQUIRED_APP_METHODS = ['getAXState'];
const METHODS = ['click', 'drag', 'setValue', 'typeText', 'pressKey', 'scroll'];

export class ComputerUseRuntimeError extends Error {
  constructor(code, message) { super(message); this.name = 'ComputerUseRuntimeError'; this.code = code; }
}
export function inspectChatGPTRuntime(cua) {
  const available = Boolean(cua && typeof cua.getApp === 'function');
  return {
    source: RUNTIME_SOURCE,
    compatibleEntryPoint: available,
    checked: ['cua.getApp'],
    appMethodsChecked: false,
    fallback: 'none',
    note: 'Shape check only. Host origin and authorization must come from the current official tool session.',
  };
}
function fail(code, message) { throw new ComputerUseRuntimeError(code, message); }

export function createChatGPTDriver(cua, { signal } = {}) {
  if (!inspectChatGPTRuntime(cua).compatibleEntryPoint) {
    fail('official_computer_use_unavailable', 'The current ChatGPT desktop session must expose the documented cua.getApp contract. No local/native/browser fallback will be started.');
  }
  let app = null;
  let appName = null;
  const check = () => signal?.throwIfAborted();
  const requireApp = () => {
    check();
    if (!app) fail('app_not_bound', 'Bind an authorized app through the official Computer Use runtime first.');
    return app;
  };
  const invoke = async (method, ...args) => {
    const target = requireApp();
    if (typeof target[method] !== 'function') fail('official_method_unavailable', `The current official App interface does not expose ${method}; stop and inspect its documentation.`);
    // No eval, subprocess, UIA, SendInput, browser extension or alternate executor.
    return Reflect.apply(target[method], target, args);
  };
  return {
    source: RUNTIME_SOURCE,
    async bind(name) {
      check();
      if (typeof name !== 'string' || !name.trim()) fail('invalid_app_name', 'A concrete app name is required.');
      app = null; appName = null;
      const candidate = await cua.getApp(name);
      check();
      if (!candidate || REQUIRED_APP_METHODS.some(m => typeof candidate[m] !== 'function')) {
        fail('official_state_interface_unsupported', 'The official App object does not expose getAXState. Do not fabricate AX or substitute the removed Windows backend.');
      }
      app = candidate; appName = name;
      return { appName, source: RUNTIME_SOURCE, methods: METHODS.filter(m => typeof app[m] === 'function') };
    },
    async observe({ full = true } = {}) {
      const state = await invoke('getAXState', { emit: false, disableDiffing: full });
      check();
      if (typeof state !== 'string' || !state.trim()) {
        fail('official_state_format_unsupported', 'Expected non-empty AX text from the documented official interface. Screenshots/objects are not silently converted to AX.');
      }
      return state;
    },
    async click(index, options) {
      if (!Number.isInteger(index) || index < 0) fail('unbound_coordinate_action', 'This AX harness accepts only current AX element indices. GPT must handle visual coordinates separately with official Computer Use.');
      return invoke('click', index, options);
    },
    async drag() { fail('unbound_coordinate_action', 'Coordinate drag is handed back to GPT for explicit official Computer Use; it is not inferred from a text target.'); },
    async setValue(index, value) {
      if (!Number.isInteger(index) || index < 0 || typeof value !== 'string') fail('invalid_action_arguments', 'setValue needs a current AX index and explicit text.');
      return invoke('setValue', index, value);
    },
    async typeText(text) {
      if (typeof text !== 'string') fail('invalid_action_arguments', 'typeText needs explicit text.');
      return invoke('typeText', text);
    },
    async pressKey(key) {
      if (typeof key !== 'string' || !key.trim()) fail('invalid_action_arguments', 'pressKey needs an explicit key.');
      return invoke('pressKey', key);
    },
    async scroll(index, direction, pages) {
      if (!Number.isInteger(index) || index < 0 || !['up', 'down', 'left', 'right'].includes(direction) || !Number.isInteger(pages) || pages < 1 || pages > 5) fail('invalid_action_arguments', 'scroll needs a current AX index, direction, and 1–5 pages.');
      return invoke('scroll', index, direction, pages);
    },
  };
}

import { ComputerUseRuntimeError, RUNTIME_SOURCE } from './chatgpt-driver.mjs';

// Official @oai/sky only; this module neither imports nor launches a desktop backend.
const observations = new WeakMap();
const fail = (code, message) => { throw new ComputerUseRuntimeError(code, message); };
export function inspectWindowsRuntime(sky) {
  return {
    source: RUNTIME_SOURCE, interface: 'sky-window2',
    compatibleEntryPoint: Boolean(sky && sky.target === 'windows' &&
      ['list_apps', 'get_window_state'].every(k => typeof sky[k] === 'function')),
    checked: ['sky.target', 'sky.list_apps', 'sky.get_window_state'],
    fallback: 'none', note: 'Shape check only; use the real object from the official tool session.',
  };
}

export function createWindowsDriver(sky, { windowId, signal } = {}) {
  if (!inspectWindowsRuntime(sky).compatibleEntryPoint) fail('official_computer_use_unavailable', 'Official Windows sky runtime required.');
  if (windowId !== undefined && !Number.isInteger(windowId)) fail('invalid_window_id', 'Use an id returned by the official tool.');
  if (!observations.has(sky)) observations.set(sky, new Map());
  const registry = observations.get(sky);
  let window = null, observation = null;
  const check = () => signal?.throwIfAborted();
  const identity = w => JSON.stringify([w.app, w.id]);
  const invoke = async (method, args) => {
    check();
    if (typeof sky[method] !== 'function') fail('official_method_unavailable', 'Required official method unavailable.');
    return Reflect.apply(sky[method], sky, [args]);
  };
  const current = index => {
    check();
    if (!window) fail('app_not_bound', 'Select a unique official window first.');
    if (!observation || registry.get(identity(window)) !== observation) fail('stale_observation', 'Reobserve and review before acting.');
    if (index !== undefined && (!Number.isInteger(index) || !observation.indices.has(index))) fail('unobserved_target', 'Element index is absent from the current tree.');
    return observation;
  };
  const input = async (method, args, index) => {
    current(index);
    observation = null;
    registry.delete(identity(window)); // Also invalidate after an uncertain/failed action.
    return invoke(method, { window, ...args });
  };
  return {
    source: RUNTIME_SOURCE,
    async bind(name) {
      check();
      if (window) registry.delete(identity(window));
      window = null; observation = null;
      const apps = await sky.list_apps(); check();
      const matches = apps.filter(a => a.id === name || a.displayName === name);
      if (matches.length !== 1) fail('ambiguous_app', 'Use one exact app id or display name from list_apps.');
      const windows = matches[0].windows.filter(w => windowId === undefined || w.id === windowId);
      if (windows.length !== 1) fail('ambiguous_window', 'Open a target window or select one returned windowId.');
      const selected = windows[0];
      if (!Number.isInteger(selected.id) || selected.app !== matches[0].id) fail('invalid_window', 'Invalid official window identity.');
      window = selected;
      registry.delete(identity(window));
      return { appName: name, window: { ...window }, source: RUNTIME_SOURCE };
    },
    async observe() {
      check();
      if (!window) fail('app_not_bound', 'Bind an app first.');
      observation = null; registry.delete(identity(window));
      const state = await invoke('get_window_state', { window, include_screenshot: false, include_text: true });
      check();
      if (!state?.window || identity(state.window) !== identity(window)) fail('window_changed', 'Window identity changed; reselect the target.');
      const tree = state.accessibility?.tree;
      if (typeof tree !== 'string' || !tree.trim()) fail('official_state_format_unsupported', 'No official accessibility tree; hand control to GPT.');
      window = state.window;
      const indices = new Set([...tree.matchAll(/^\s*(\d+)\s+/gm)].map(m => Number(m[1])));
      observation = { tree, indices, focus: state.accessibility.focused_element };
      registry.set(identity(window), observation);
      return tree; // Preserve the host text and indexes exactly; never manufacture AX.
    },
    snapshot() {
      const o = current();
      return { window: { ...window }, tree: o.tree, focusedElement: o.focus ?? null };
    },
    async click(index, options) {
      if (!Number.isInteger(index) || index < 0) fail('unobserved_target', 'A current element index is required.');
      if (options && Object.keys(options).some(k => k !== 'mouseButton')) fail('invalid_action_arguments', 'Only an explicit mouse button is accepted.');
      const button = options?.mouseButton ?? 'left';
      if (!['left', 'right', 'middle'].includes(button)) fail('invalid_action_arguments', 'Unsupported mouse button.');
      return input('click', { element_index: index, mouse_button: button }, index);
    },
    async setValue(index, value) {
      if (!Number.isInteger(index) || index < 0 || typeof value !== 'string') fail('invalid_action_arguments', 'Current index and explicit text required.');
      return input('set_value', { element_index: index, value }, index);
    },
    async typeText(text, targetIndex) {
      const o = current(targetIndex);
      const focusIndex = /^\s*(\d+)\s+/.exec(o.focus ?? '');
      if (!Number.isInteger(targetIndex) || !focusIndex || Number(focusIndex[1]) !== targetIndex) fail('focus_unverified', 'Observe and review the intended focused element first.');
      if (typeof text !== 'string' || /[\r\n\t\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) fail('invalid_action_arguments', 'Use literal text; control keys need separate reviewed steps.');
      return input('type_text', { text }, targetIndex);
    },
    async pressKey(key) {
      if (typeof key !== 'string' || !key.trim() || key.split('+').some(k => /^(meta|windows|win|cmd|command|super|os)(?:_[lr])?$/i.test(k.trim()))) fail('invalid_action_arguments', 'Explicit permitted key required; Windows-key shortcuts are forbidden.');
      return input('press_key', { key });
    },
    async scroll() { fail('official_action_requires_takeover', 'Windows scroll needs observed coordinates; GPT must use the official tool separately.'); },
    async drag() { fail('official_action_requires_takeover', 'Coordinate drag requires GPT takeover.'); },
  };
}

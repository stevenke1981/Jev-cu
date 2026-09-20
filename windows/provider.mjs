// Shared Windows companion, adapted to Jev-cu's existing OpenRouter wrapper.
import { ask, DEFAULT_MODEL } from '../scripts/jev-decide.mjs';
export const MODEL = DEFAULT_MODEL;
export function askWindows(options) {
  return ask({ ...options, timeoutMs: 20000, maxRetries: 1,
    fetchImpl: (url, init) => fetch(url, { ...init, redirect: 'error',
      signal: options.signal ? AbortSignal.any([init.signal, options.signal]) : init.signal,
    }),
  });
}

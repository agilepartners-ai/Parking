/**
 * Safety nets so the app can never sit on a blank screen:
 *  - withTimeout: no network or storage call may wait forever
 *  - captureErrors: any uncaught JS error is stored and shown on screen (instead of a silent crash or frozen splash)
 */

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} did not answer within ${Math.round(ms / 1000)} seconds`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

/** fetch that gives up after `ms` (used by the Supabase client so a dead connection fails fast). */
export function fetchWithTimeout(ms: number): typeof fetch {
  return (input, init) => {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    const outer = init?.signal;
    if (outer) outer.addEventListener('abort', () => ctrl.abort());
    return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(id));
  };
}

type Listener = (e: { message: string; stack?: string; at: number }) => void;
const listeners = new Set<Listener>();
let last: { message: string; stack?: string; at: number } | null = null;
let installed = false;

export const lastCapturedError = () => last;
export function onCapturedError(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function record(error: unknown) {
  const err = error instanceof Error ? error : new Error(String(error));
  last = { message: err.message, stack: err.stack, at: Date.now() };
  listeners.forEach((l) => l(last!));
}

export function captureErrors() {
  if (installed) return;
  installed = true;
  try {
    const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void } };
    const prev = g.ErrorUtils?.getGlobalHandler();
    g.ErrorUtils?.setGlobalHandler((e, fatal) => {
      record(e);
      // Do not forward fatal errors to the default handler: it would close the app. The error screen explains what happened instead.
      if (!fatal) prev?.(e, fatal);
    });
  } catch {
    /* ignore */
  }
  try {
    (globalThis as unknown as { addEventListener?: (t: string, f: (e: { reason?: unknown }) => void) => void }).addEventListener?.('unhandledrejection', (ev) => record(ev.reason));
  } catch {
    /* ignore */
  }
}

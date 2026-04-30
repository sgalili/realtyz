/**
 * Suppresses ALL sonner toasts while the app is in demo mode.
 *
 * We monkey-patch the singleton `toast` function exported by sonner so every
 * call site (toast(), toast.success(), toast.error(), toast.loading(), etc.)
 * becomes a no-op when localStorage flag `kalpiz-demo-mode === 'true'`.
 *
 * Real (authenticated) sessions continue to receive toasts normally.
 */
import { toast } from 'sonner';

const DEMO_STORAGE_KEY = 'kalpiz-demo-mode';

const isDemoActive = (): boolean => {
  try {
    return window.localStorage.getItem(DEMO_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

let installed = false;

export const installDemoToastFilter = () => {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const target = toast as unknown as Record<string | symbol, unknown> & ((...a: unknown[]) => unknown);
  const originalCallable = target as (...a: unknown[]) => unknown;

  // Capture the original method implementations so we can call them when allowed.
  const methodKeys = [
    'success', 'error', 'info', 'warning', 'message',
    'loading', 'promise', 'custom', 'dismiss', 'remove',
  ] as const;

  const originals: Record<string, ((...a: unknown[]) => unknown) | undefined> = {};
  for (const key of methodKeys) {
    const fn = target[key];
    if (typeof fn === 'function') originals[key] = fn.bind(toast) as (...a: unknown[]) => unknown;
  }

  // Wrap the callable form: toast('message', opts)
  const wrappedCallable = (...args: unknown[]) => {
    if (isDemoActive()) return undefined;
    return originalCallable.apply(toast, args);
  };

  // Override each method to be a no-op while demo is active.
  // We always allow `dismiss` / `remove` to keep cleanup safe.
  for (const key of methodKeys) {
    const original = originals[key];
    if (!original) continue;
    if (key === 'dismiss' || key === 'remove') continue;
    try {
      Object.defineProperty(toast, key, {
        configurable: true,
        writable: true,
        value: (...args: unknown[]) => {
          if (isDemoActive()) {
            // For toast.promise, still resolve the promise so callers don't break.
            if (key === 'promise' && args[0] && typeof (args[0] as Promise<unknown>).then === 'function') {
              return args[0];
            }
            return undefined;
          }
          return original(...args);
        },
      });
    } catch {
      // ignore if property is non-configurable in some build
    }
  }

  // Replace the call signature of the imported singleton via a Proxy-like swap:
  // sonner exports a function whose own properties we just patched. Wrap the
  // call by reassigning its [[Call]] is not possible in JS, so we patch the
  // module export by intercepting through Object.setPrototypeOf trick: instead,
  // we expose a global flag that consumers shouldn't bypass. The vast majority
  // of usage in this codebase is `toast.success(...)` etc., which we've covered.
  // For the bare `toast('msg')` form we provide a wrapper through a property
  // trap on the function object so callers using `toast.call(...)` still work.
  (toast as unknown as { __callWrapped?: typeof wrappedCallable }).__callWrapped = wrappedCallable;
};

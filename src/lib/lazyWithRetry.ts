import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "chunk-reload-at";

/**
 * Wraps React.lazy so that a failed dynamic import (usually a stale chunk hash
 * after a new deploy) triggers one retry and then a single hard reload.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(RELOAD_KEY);
      return mod;
    } catch (err) {
      // one silent retry (transient network / cache miss)
      try {
        return await factory();
      } catch {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
        if (Date.now() - last > 15000) {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          window.location.reload();
          // never resolves; page is reloading
          return new Promise<{ default: T }>(() => {});
        }
        throw err;
      }
    }
  });
}

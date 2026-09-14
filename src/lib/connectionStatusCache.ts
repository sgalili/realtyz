/**
 * Sticky connection status cache.
 *
 * A service that was successfully connected must keep showing as connected —
 * across sessions, re-renders and collapsed cards — until the user explicitly
 * disconnects it. Live probes are only allowed to UPGRADE the state to
 * connected; a failed / still-loading probe never downgrades it.
 */

const KEY = 'realtyz:conn-status:v1';

export type StickyService = 'gmail' | 'google_calendar' | 'youtube' | 'facebook';

type Entry = { connected: boolean; label?: string | null; at: number };
type Store = Record<string, Entry>;

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store;
  } catch {
    return {};
  }
}

function write(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function entryKey(service: StickyService, scope?: string | null) {
  return `${service}:${scope ?? 'self'}`;
}

/** Remembers a successful connection (and the account label to display). */
export function rememberConnected(service: StickyService, scope?: string | null, label?: string | null) {
  const store = read();
  const key = entryKey(service, scope);
  store[key] = { connected: true, label: label ?? store[key]?.label ?? null, at: Date.now() };
  write(store);
}

/** Called only from an explicit user-initiated disconnect. */
export function forgetConnected(service: StickyService, scope?: string | null) {
  const store = read();
  delete store[entryKey(service, scope)];
  write(store);
}

export function isRememberedConnected(service: StickyService, scope?: string | null): boolean {
  return read()[entryKey(service, scope)]?.connected === true;
}

export function rememberedLabel(service: StickyService, scope?: string | null): string | null {
  return read()[entryKey(service, scope)]?.label ?? null;
}

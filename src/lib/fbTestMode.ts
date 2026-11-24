/**
 * Facebook single-target end-to-end test mode. Scoped per workspace in local
 * storage; while enabled every group-posting surface clamps its selection to
 * the one chosen test group so no mass run can start by accident.
 */
export type FbTestTarget = { id: string; name: string; url: string | null };
export type FbTestModeState = { enabled: boolean; target: FbTestTarget | null; queueRowId: string | null };

const EVENT = 'fb-test-mode:changed';
const key = (ws: string | null | undefined) => `fbTestMode:${ws ?? 'none'}`;
const EMPTY: FbTestModeState = { enabled: false, target: null, queueRowId: null };

export function loadFbTestMode(ws: string | null | undefined): FbTestModeState {
  if (!ws) return EMPTY;
  try {
    const raw = localStorage.getItem(key(ws));
    const p = raw ? JSON.parse(raw) : null;
    return p && typeof p === 'object' ? { ...EMPTY, ...p, enabled: p.enabled === true } : EMPTY;
  } catch { return EMPTY; }
}

export function saveFbTestMode(ws: string | null | undefined, s: FbTestModeState) {
  if (!ws) return;
  try {
    if (!s.enabled && !s.target && !s.queueRowId) localStorage.removeItem(key(ws));
    else localStorage.setItem(key(ws), JSON.stringify(s));
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { ws } }));
}

export function subscribeFbTestMode(cb: () => void) {
  const h = () => cb();
  window.addEventListener(EVENT, h);
  window.addEventListener('storage', h);
  return () => { window.removeEventListener(EVENT, h); window.removeEventListener('storage', h); };
}

/** Returns the ids allowed while test mode is on (only the test target), or the input untouched. */
export function clampToTestTarget(ids: string[], s: FbTestModeState): string[] {
  if (!s.enabled) return ids;
  if (!s.target) return [];
  return ids.includes(s.target.id) ? [s.target.id] : [];
}

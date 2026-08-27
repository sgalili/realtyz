// ============================================================
// Emergency stop for bulk AI draft generation
// ------------------------------------------------------------
// Bulk composer generation fans out across many drafts. The operator needs a
// single control that halts every pending generation instantly while KEEPING
// everything already generated (tokens are never re-spent on a restart).
// The flag lives in localStorage so a refresh cannot silently resume the
// storm, and listeners keep the UI in sync.
// ============================================================

const KEY = 'rz-generation-stopped:v1';
const listeners = new Set<(stopped: boolean) => void>();

// The stop is a SESSION-scoped emergency brake: a page load / refresh must
// always come back generating, otherwise drafts stay silently empty forever.
// Legacy persisted flags are cleared on module init.
if (typeof window !== 'undefined') {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function isGenerationStopped(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}


function emit(stopped: boolean) {
  listeners.forEach((fn) => {
    try { fn(stopped); } catch { /* ignore */ }
  });
}

/** Halts every pending / future auto-generation until explicitly resumed. */
export function stopAllGeneration(): void {
  try { localStorage.setItem(KEY, '1'); } catch { /* quota */ }
  killInflightGenerations();
  emit(true);
}

/** Re-enables auto-generation (already generated drafts stay untouched). */
export function resumeGeneration(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  emit(false);
}

export function subscribeGenerationGate(fn: (stopped: boolean) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ---------- hard kill of in-flight work ----------
// Every AI request (text, first comment, image, photo import) registers an
// AbortController here. The emergency stop aborts them all so nothing keeps
// running or lands in the UI after the operator hit the kill button.
const inflight = new Set<AbortController>();

export function registerGeneration(): AbortController {
  const ctrl = new AbortController();
  inflight.add(ctrl);
  ctrl.signal.addEventListener('abort', () => inflight.delete(ctrl));
  return ctrl;
}

export function releaseGeneration(ctrl: AbortController): void {
  inflight.delete(ctrl);
}

/** Aborts every registered in-flight AI request immediately. */
export function killInflightGenerations(): number {
  const n = inflight.size;
  inflight.forEach((c) => { try { c.abort(); } catch { /* ignore */ } });
  inflight.clear();
  return n;
}

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

export function isGenerationStopped(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(KEY) === '1';
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

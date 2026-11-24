/**
 * Browser start-up side effects, ported from the former src/main.tsx. They run
 * once when the client bundle loads, before the router hydrates or navigates.
 */
import { enableGlobalSilentMode } from '@/lib/silentMode';
import { installDemoToastFilter } from '@/lib/demoToastFilter';
import { installRealtimeAuthSync } from '@/lib/realtimeAuth';
import { captureRefFromLocation } from '@/lib/referralAttribution';
import { installDomRemovalGuard } from '@/lib/domRemovalGuard';
import { purgeGhostQueueCache } from '@/lib/extensionGroupBridge';
import { installExternalLinkGuard } from '@/lib/externalLinkGuard';

const STALE_CHUNK_RELOAD_KEY = '__stale_chunk_reloaded_at';

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i.test(msg);
}

// Stale-chunk recovery: after a redeploy, the cached page may reference hashed
// JS chunks that no longer exist. Force one reload so the browser pulls the
// fresh manifest instead of showing a blank screen.
export function maybeReloadForStaleChunk(err: unknown) {
  if (!isChunkLoadError(err)) return;
  try {
    const last = Number(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) || 0);
    if (Date.now() - last < 10_000) return; // avoid reload loop
    sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    // ignore storage failures
  }
  window.location.reload();
}

let booted = false;

export function runClientBoot() {
  if (booted || typeof window === 'undefined') return;
  booted = true;
  installDomRemovalGuard();
  installExternalLinkGuard();
  purgeGhostQueueCache();
  enableGlobalSilentMode();
  installDemoToastFilter();
  installRealtimeAuthSync();
  // Lock in referral attribution before any router navigation rewrites the URL.
  captureRefFromLocation();

  window.addEventListener('error', (e) => maybeReloadForStaleChunk(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => {
    maybeReloadForStaleChunk(e.reason);
    // Auth/realtime recovery rejections (token refresh races, offline tabs) are
    // transient: log them instead of letting them surface as fatal app errors.
    const msg = String((e.reason as { message?: unknown } | null)?.message ?? e.reason ?? '');
    if (/_recoverAndRefresh|_notifyAllSubscribers|AuthApiError|refresh_token|Failed to fetch/i.test(msg)) {
      // eslint-disable-next-line no-console
      console.warn('[auth] transient recovery error swallowed:', msg);
      e.preventDefault();
    }
  });
}

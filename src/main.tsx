import { createRoot } from "react-dom/client";
import "./index.css";
import { enableGlobalSilentMode } from "./lib/silentMode";
import { installDemoToastFilter } from "./lib/demoToastFilter";
import { installRealtimeAuthSync } from "./lib/realtimeAuth";
import { captureRefFromLocation } from "./lib/referralAttribution";

enableGlobalSilentMode();
installDemoToastFilter();
installRealtimeAuthSync();
// Lock in referral attribution before any router navigation rewrites the URL.
captureRefFromLocation();

// Stale-chunk recovery: after a redeploy, the cached index.html may reference
// hashed JS chunks that no longer exist on the CDN. Force one reload so the
// browser pulls the fresh manifest instead of showing a blank screen.
const STALE_CHUNK_RELOAD_KEY = "__stale_chunk_reloaded_at";
function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i.test(msg);
}
function maybeReloadForStaleChunk(err: unknown) {
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
window.addEventListener("error", (e) => maybeReloadForStaleChunk(e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => maybeReloadForStaleChunk(e.reason));

const rootEl = document.getElementById("root")!;

/**
 * Popup-only fast path: hand the grant to the opener and close.
 * Resolves `false` when the window could not be closed (or there is no
 * opener at all) so the caller can boot the real app instead of leaving the
 * user staring at a spinner forever.
 */
function renderOAuthBridge(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = params.get("code") ?? hashParams.get("code");
  const state = params.get("state") ?? hashParams.get("state") ?? "";
  const error = params.get("error") ?? hashParams.get("error");
  const errorDescription =
    params.get("error_description") ?? hashParams.get("error_description");

  rootEl.innerHTML = `
    <div dir="rtl" style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:hsl(var(--background));color:hsl(var(--foreground));font-family:Assistant,Arial,sans-serif">
      <div style="text-align:center;display:flex;flex-direction:column;gap:8px;align-items:center">
        <div style="height:32px;width:32px;border-radius:9999px;border:2px solid hsl(var(--primary));border-top-color:transparent;animation:spin 1s linear infinite"></div>
        <p style="margin:0;font-size:14px;color:hsl(var(--muted-foreground))">מסיים אימות מאובטח...</p>
      </div>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(style);

  try {
    window.opener?.postMessage(
      { type: "realtyz-oauth-callback", code, state, error, errorDescription },
      window.location.origin,
    );
  } catch {
    // noop
  }

  return new Promise<boolean>((resolve) => {
    window.setTimeout(() => {
      try {
        window.close();
      } catch {
        // noop
      }
      // Give the browser a moment; if the window is still here, fall back.
      window.setTimeout(() => resolve(window.closed === true), 600);
    }, 200);
  });
}

async function bootstrap() {
  const isOAuthCallback = /^\/oauth\/callback\/?$/.test(window.location.pathname);
  // Only take the popup shortcut when there really IS an opener to hand the
  // grant to. Full-page redirects (Google one-click) must reach the React
  // callback route, which performs the exchange and can never hang.
  let hasOpener = false;
  try {
    hasOpener = !!window.opener && !window.opener.closed && window.opener !== window;
  } catch {
    hasOpener = !!window.opener;
  }
  const callbackParams = new URLSearchParams(window.location.search);
  const callbackHash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const callbackState = callbackParams.get("state") ?? callbackHash.get("state") ?? "";
  const isFacebookCallback = callbackState.startsWith("facebook");
  if (isOAuthCallback && hasOpener && !isFacebookCallback) {
    const closed = await renderOAuthBridge();
    if (closed) return;
    // Closing was blocked — continue into the app so the callback page can
    // finish the exchange and offer the "חזרה למערכת" button.
  }

  let AppMod: { default: React.ComponentType };
  try {
    AppMod = await import("./App.tsx");
  } catch (err) {
    if (isChunkLoadError(err)) {
      try {
        AppMod = await import(/* @vite-ignore */ `./App.tsx?reload=${Date.now()}`);
      } catch (retryErr) {
        maybeReloadForStaleChunk(retryErr);
        throw retryErr;
      }
    } else {
      throw err;
    }
  }
  createRoot(rootEl).render(<AppMod.default />);
}

void bootstrap().catch((err) => {
  maybeReloadForStaleChunk(err);
  console.error(err);
});



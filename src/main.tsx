import { createRoot } from "react-dom/client";
import "./index.css";
import { enableGlobalSilentMode } from "./lib/silentMode";
import { installDemoToastFilter } from "./lib/demoToastFilter";
import { installRealtimeAuthSync } from "./lib/realtimeAuth";

enableGlobalSilentMode();
installDemoToastFilter();
installRealtimeAuthSync();

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

function renderOAuthBridge() {
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
        <p style="margin:0;font-size:11px;color:hsl(var(--muted-foreground))">חלון זה ייסגר אוטומטית</p>
      </div>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(style);

  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        {
          type: "realtyz-oauth-callback",
          code,
          state,
          error,
          errorDescription,
        },
        window.location.origin,
      );
    }
  } catch {
    // noop
  }

  window.setTimeout(() => {
    try {
      window.close();
    } catch {
      // noop
    }
  }, 250);
}

async function bootstrap() {
  const isOAuthCallback = /^\/oauth\/callback\/?$/.test(window.location.pathname);
  const callbackParams = new URLSearchParams(window.location.search);
  const callbackHash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const callbackState = callbackParams.get("state") ?? callbackHash.get("state") ?? "";
  const isFacebookCallback = callbackState.startsWith("facebook");
  if (isOAuthCallback && !isFacebookCallback) {
    renderOAuthBridge();
    return;
  }

  const { default: App } = await import("./App.tsx");
  createRoot(rootEl).render(<App />);
}

void bootstrap();


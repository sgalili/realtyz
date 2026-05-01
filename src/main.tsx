import { createRoot } from "react-dom/client";
import "./index.css";
import { enableGlobalSilentMode } from "./lib/silentMode";
import { installDemoToastFilter } from "./lib/demoToastFilter";

enableGlobalSilentMode();
installDemoToastFilter();

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
  if (isOAuthCallback) {
    renderOAuthBridge();
    return;
  }

  const { default: App } = await import("./App.tsx");
  createRoot(rootEl).render(<App />);
}

void bootstrap();


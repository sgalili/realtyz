// Keeps Supabase Realtime in sync with the current auth session and hardens
// the socket against browser tab throttling.
//
// Why this file exists:
// - `src/integrations/supabase/client.ts` is auto-generated, so we cannot pass
//   `realtime.heartbeatIntervalMs` / `worker: true` to `createClient`. Instead
//   we mutate the realtime instance at runtime (public fields on RealtimeClient).
// - Channels started before the JWT is attached silently receive no rows even
//   though the channel status is `SUBSCRIBED`. Calling `setAuth(accessToken)`
//   after every auth event guarantees RLS-scoped Realtime deliveries.
import { supabase } from "@/integrations/supabase/client";

let installed = false;

export function installRealtimeAuthSync() {
  if (installed) return;
  installed = true;

  const rt: any = (supabase as any).realtime;
  // Longer heartbeat than the 30s default keeps the socket alive when the
  // browser throttles background tabs (Chrome throttles timers to >1min).
  try { if (rt) rt.heartbeatIntervalMs = 25_000; } catch { /* noop */ }

  const pushAuth = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) (supabase as any).realtime.setAuth(token);
    } catch { /* noop */ }
  };

  // Attach on boot + every auth state change (login, refresh, tab focus).
  void pushAuth();
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.access_token) {
      try { (supabase as any).realtime.setAuth(session.access_token); } catch { /* noop */ }
    }
  });

  // Re-arm on tab focus in case the socket was frozen while backgrounded.
  if (typeof window !== "undefined") {
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void pushAuth();
    });
    window.addEventListener("focus", () => { void pushAuth(); });
  }
}

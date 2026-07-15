// Live-only image resolver.
//
// Called from the client every time a property card / detail page opens. It
// forwards the request to `homely-fetch-property` with action
// `resolveLiveImage`, which:
//   1. Logs into Webtiv/Homely with the workspace's broker credentials.
//   2. Fetches the rich property detail in real time (no DB cache, no
//      storage bucket lookup).
//   3. Validates the returned record's property_id 1:1 against
//      listings.external_id — mismatch → HTTP 409 + integration_error_logs.
//   4. Returns the fresh photo URLs.
//
// This function itself only handles CORS + JWT + upstream invocation so the
// heavy lifting (login/session/id-check) stays consolidated inside
// homely-fetch-property.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const listingId = String((body as { listing_id?: unknown })?.listing_id ?? "").trim();
    if (!listingId) return json({ ok: false, error: "listing_id_required" }, 400);

    const upstream = await fetch(`${SUPABASE_URL}/functions/v1/homely-fetch-property`, {
      method: "POST",
      headers: {
        Authorization: auth,
        apikey: ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "resolveLiveImage", listing_id: listingId }),
    });
    const text = await upstream.text();
    let payload: unknown = null;
    try { payload = JSON.parse(text); } catch { payload = { ok: false, error: "upstream_non_json", raw: text.slice(0, 400) }; }
    return json(payload, upstream.status);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message ?? "unexpected" }, 500);
  }
});

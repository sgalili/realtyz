// Yad2 connection verifier — mirrors the Homely verifier UX.
// Validates that the broker has an email + token stored, and (best-effort)
// pings the Yad2 feed gateway with the bearer token. The placeholder token
// "test_pending" is accepted as a "waiting for official credentials" state
// so the UI can flip into a friendly pending mode without erroring out.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PING_URL = "https://gw.yad2.co.il/realestate-feed/forsale/map?city=הרצליה";

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
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: key } = await admin
      .from("user_api_keys")
      .select("yad2_username, yad2_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    const email = (key?.yad2_username ?? "").trim();
    const token = (key?.yad2_api_key ?? "").trim();
    if (!email || !token) {
      return json({ ok: false, status: "missing_credentials", note: "יש להזין Email ו-API Token של Yad2" });
    }
    if (token === "test_pending") {
      return json({
        ok: true,
        status: "pending",
        note: "החיבור בהמתנה לאישור יד2. נתוני הרצליה ורמת השרון יימשכו אוטומטית עם הזנת הטוקן הרשמי.",
      });
    }

    try {
      const upstream = await fetch(PING_URL, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (upstream.ok) {
        return json({ ok: true, status: "verified", email });
      }
      return json({
        ok: false,
        status: "auth_failed",
        http: upstream.status,
        note: `Yad2 דחה את הטוקן (HTTP ${upstream.status}). ודאו שהוא הטוקן הרשמי שהונפק לכם.`,
      });
    } catch (e) {
      return json({ ok: false, status: "network_error", error: (e as Error).message });
    }
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

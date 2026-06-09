// Admin-only: delete a suspended/stale Ayrshare profile via the Ayrshare API.
// Bypasses the usual workspace flow because suspended profiles cannot be
// removed through the dashboard.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AYRSHARE_API_KEY = Deno.env.get("AYRSHARE_API_KEY") ?? "";

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
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "forbidden: admin only" }, 403);

    if (!AYRSHARE_API_KEY) return json({ error: "AYRSHARE_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const profileKey: string | undefined = body?.profile_key;
    if (!profileKey || typeof profileKey !== "string") {
      return json({ error: "profile_key required" }, 400);
    }

    // Ayrshare profile delete: DELETE /api/profiles with Profile-Key header.
    const res = await fetch("https://api.ayrshare.com/api/profiles/profile", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ profileKey }),
    });
    const text = await res.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }

    // Clear cached reference from workspace_social_profile if it matched.
    try {
      await admin
        .from("workspace_social_profile")
        .update({
          ayrshare_profile_key: null,
          ayrshare_ref_id: null,
          facebook_page_id: null,
          facebook_page_name: null,
        })
        .eq("ayrshare_profile_key", profileKey);
    } catch (_) { /* non-fatal */ }

    return json({
      ok: res.ok,
      status: res.status,
      ayrshare: payload,
    }, 200);
  } catch (e) {
    console.error("[ayrshare-profile-delete] fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

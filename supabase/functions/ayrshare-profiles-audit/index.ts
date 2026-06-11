// One-off diagnostic: lists Ayrshare profiles under the primary API key and
// checks which profile actually has Facebook linked. Service-role only.
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (auth !== SERVICE) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const KEY = Deno.env.get("AYRSHARE_API_KEY")?.trim().replace(/^["']|["']$/g, "");
  if (!KEY) return new Response(JSON.stringify({ error: "no key" }), { status: 500, headers: corsHeaders });

  const listRes = await fetch("https://api.ayrshare.com/api/profiles", {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  const list = await listRes.json();
  const profiles: any[] = Array.isArray(list?.profiles) ? list.profiles : [];
  const out: any[] = [];
  for (const p of profiles.slice(0, 20)) {
    const pk = p?.profileKey;
    let linked: string[] = [];
    let userStatus = 0;
    if (pk) {
      try {
        const u = await fetch("https://api.ayrshare.com/api/user", {
          headers: { Authorization: `Bearer ${KEY}`, "Profile-Key": pk },
        });
        userStatus = u.status;
        const ud = await u.json();
        linked = Array.isArray(ud?.activeSocialAccounts) ? ud.activeSocialAccounts : [];
      } catch { /* noop */ }
    }
    out.push({
      title: p?.title, refId: p?.refId, profileKeyPrefix: String(pk || "").slice(0, 12),
      profileKey: pk, suspended: p?.suspended ?? null, userStatus, linked,
    });
  }
  return new Response(JSON.stringify({ count: profiles.length, profiles: out }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

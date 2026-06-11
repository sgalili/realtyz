// Self-healing Ayrshare credentials repair: lists profiles under the primary
// API key, finds the one with Facebook actually linked, and rewrites the
// workspace_social_profile singleton with that live key. Returns only key
// prefixes (never full keys) to the caller. Any authenticated user may run it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let allowed = auth === SERVICE;
  if (!allowed && auth) {
    try {
      const { data } = await admin.auth.getUser(auth);
      allowed = !!data?.user?.id;
    } catch { /* noop */ }
  }
  if (!allowed) return json({ error: "forbidden" }, 403);

  const KEY = Deno.env.get("AYRSHARE_API_KEY")?.trim().replace(/^["']|["']$/g, "");
  if (!KEY) return json({ error: "AYRSHARE_API_KEY missing" }, 500);

  // Direct test of the stored workspace profile key.
  const { data: ws } = await admin
    .from("workspace_social_profile")
    .select("ayrshare_profile_key, ayrshare_ref_id")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .maybeSingle();
  let storedTest: any = null;
  const storedKey = typeof ws?.ayrshare_profile_key === "string" ? ws.ayrshare_profile_key.trim() : "";
  if (storedKey) {
    const u = await fetch("https://api.ayrshare.com/api/user", {
      headers: { Authorization: `Bearer ${KEY}`, "Profile-Key": storedKey },
    });
    const ud = await u.json().catch(() => ({}));
    storedTest = {
      status: u.status,
      refId: ws?.ayrshare_ref_id ?? null,
      activeSocialAccounts: ud?.activeSocialAccounts ?? null,
      displayNames: Array.isArray(ud?.displayNames)
        ? ud.displayNames.map((a: any) => ({ platform: a?.platform, id: a?.id ?? a?.pageId ?? null, displayName: a?.displayName ?? null }))
        : null,
      message: ud?.message ?? null,
      code: ud?.code ?? null,
    };
  }


  const listRes = await fetch("https://api.ayrshare.com/api/profiles", {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  const list = await listRes.json();
  const profiles: any[] = Array.isArray(list?.profiles) ? list.profiles : [];

  const audit: any[] = [];
  let best: { profileKey: string; refId: string | null; fbId: string | null; fbName: string | null } | null = null;

  for (const p of profiles.slice(0, 20)) {
    const pk = typeof p?.profileKey === "string" ? p.profileKey.trim() : "";
    let linked: string[] = [];
    let fbId: string | null = null;
    let fbName: string | null = null;
    let userStatus = 0;
    if (pk) {
      try {
        const u = await fetch("https://api.ayrshare.com/api/user", {
          headers: { Authorization: `Bearer ${KEY}`, "Profile-Key": pk },
        });
        userStatus = u.status;
        const ud = await u.json();
        linked = Array.isArray(ud?.activeSocialAccounts) ? ud.activeSocialAccounts : [];
        const fb = Array.isArray(ud?.displayNames)
          ? ud.displayNames.find((a: any) => String(a?.platform || "").toLowerCase() === "facebook")
          : null;
        fbId = fb?.id || fb?.pageId || null;
        fbName = fb?.displayName || fb?.username || null;
      } catch { /* noop */ }
    }
    const hasFb = linked.map((s) => String(s).toLowerCase()).includes("facebook");
    audit.push({
      title: p?.title ?? null,
      refId: p?.refId ?? null,
      keyPrefix: pk.slice(0, 8),
      suspended: p?.suspended ?? null,
      userStatus,
      linked,
    });
    if (hasFb && !best) best = { profileKey: pk, refId: p?.refId ?? null, fbId, fbName };
  }

  let repaired = false;
  if (best) {
    const { error } = await admin
      .from("workspace_social_profile")
      .update({
        ayrshare_profile_key: best.profileKey,
        ayrshare_ref_id: best.refId,
        facebook_page_id: best.fbId,
        facebook_page_name: best.fbName,
        connected_platforms: ["facebook"],
        updated_at: new Date().toISOString(),
      })
      .eq("id", "00000000-0000-0000-0000-000000000001");
    repaired = !error;
    if (error) console.error("[ayrshare-profiles-audit] repair failed", error.message);
  }

  return json({
    count: profiles.length,
    storedTest,
    audit,
    repaired,
    active: best ? { keyPrefix: best.profileKey.slice(0, 8), refId: best.refId, fbName: best.fbName } : null,
  });
});

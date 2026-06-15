// Pulls Facebook Groups from Ayrshare using the workspace's SHARED profile key.
// This bypasses Meta's /me/groups restrictions by relying on Ayrshare's
// Facebook Groups feed endpoint, which surfaces groups the connected page/user
// has authorized via Ayrshare's OAuth flow.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AYR_BASE = "https://api.ayrshare.com/api";
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("AYRSHARE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!apiKey) return json({ groups: [], error: "AYRSHARE_API_KEY missing" }, 200);

    const admin = createClient(supabaseUrl, serviceKey);

    // Allow caller to override (debug) but default to the live workspace key.
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const overrideKey = typeof body?.profileKey === "string" ? body.profileKey.trim() : "";

    let profileKey = overrideKey;
    if (!profileKey) {
      const { data: ws } = await admin
        .from("workspace_social_profile")
        .select("ayrshare_profile_key")
        .eq("id", WORKSPACE_ID)
        .maybeSingle();
      profileKey = (ws?.ayrshare_profile_key as string | null) ?? "";
    }
    if (!profileKey) return json({ groups: [], error: "no_profile_key" }, 200);

    const endpoints = [
      `${AYR_BASE}/feed/facebook/groups`,
      `${AYR_BASE}/groups/facebook`,
    ];

    let groups: any[] = [];
    let lastStatus = 0;
    let lastBody: any = null;
    for (const url of endpoints) {
      try {
        const r = await fetch(url, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Profile-Key": profileKey,
          },
        });
        lastStatus = r.status;
        const text = await r.text();
        let parsed: any = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
        lastBody = parsed;
        if (!r.ok) {
          console.warn("[ayrshare-groups-fetch] non-ok", url, r.status, text?.slice(0, 200));
          continue;
        }
        const arr = Array.isArray(parsed?.groups)
          ? parsed.groups
          : Array.isArray(parsed?.data)
            ? parsed.data
            : Array.isArray(parsed)
              ? parsed
              : [];
        if (arr.length) {
          groups = arr;
          break;
        }
      } catch (e) {
        console.warn("[ayrshare-groups-fetch] fetch error", url, e);
      }
    }

    const mapped = groups
      .map((g: any) => {
        const id = String(g?.id ?? g?.groupId ?? g?.group_id ?? "").trim();
        if (!id) return null;
        return {
          group_id: id,
          group_name: String(g?.name ?? g?.groupName ?? g?.group_name ?? id),
          group_icon: g?.icon ?? g?.image ?? g?.picture ?? null,
          connected: true,
        };
      })
      .filter(Boolean);

    return json({ groups: mapped, profileKey, status: lastStatus, raw: lastBody });
  } catch (e) {
    console.error("[ayrshare-groups-fetch] error", e);
    return json({ groups: [], error: e instanceof Error ? e.message : "unknown" }, 200);
  }
});

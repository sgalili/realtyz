// facebook-groups-fetch — returns the list of Facebook Groups linked to the
// workspace's Ayrshare profile so the campaign UI can multi-select them as
// cross-posting destinations. Strict workspace isolation: caller must be an
// authenticated user, and we only ever read the singleton
// workspace_social_profile row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveWorkspaceProfileKey } from "../_shared/ayrshare-helpers.ts";

const AYR_USER_URL = "https://api.ayrshare.com/api/user";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const AYRSHARE_API_KEY = Deno.env.get("AYRSHARE_API_KEY");
    if (!AYRSHARE_API_KEY) return json({ error: "AYRSHARE_API_KEY not configured" }, 500);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

    // Tenant gate — only authenticated users can list groups.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: authData } = await admin.auth.getUser(token);
    if (!authData?.user?.id) return json({ error: "unauthorized" }, 401);

    const { profileKey } = await resolveWorkspaceProfileKey(admin);
    if (!profileKey) return json({ error: "workspace ayrshare profile key missing", groups: [] }, 200);

    const res = await fetch(AYR_USER_URL, {
      headers: {
        Authorization: `Bearer ${AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey,
      },
    });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!res.ok) {
      console.error("[facebook-groups-fetch] /user failed", res.status, text);
      return json({ error: body?.message ?? `Ayrshare ${res.status}`, status: res.status, groups: [] }, 502);
    }

    // Ayrshare returns linked Facebook Groups in `displayNames[].facebookGroups[]`
    // for the facebook entry, or as a top-level `facebookGroups` array depending
    // on the account variant. Normalize both shapes.
    const groupsRaw: any[] = [];
    if (Array.isArray(body?.facebookGroups)) groupsRaw.push(...body.facebookGroups);
    if (Array.isArray(body?.displayNames)) {
      for (const dn of body.displayNames) {
        if (Array.isArray(dn?.facebookGroups)) groupsRaw.push(...dn.facebookGroups);
      }
    }

    const seen = new Set<string>();
    const groups = groupsRaw
      .map((g: any) => {
        const id = String(g?.id ?? g?.groupId ?? g?.pageId ?? "").trim();
        const name = String(g?.name ?? g?.displayName ?? g?.title ?? "").trim();
        const icon = g?.icon ?? g?.image ?? g?.picture ?? g?.avatar ?? null;
        return id ? { group_id: id, group_name: name || id, group_icon: icon, connected: true } : null;
      })
      .filter((g): g is { group_id: string; group_name: string; group_icon: any; connected: boolean } => !!g)
      .filter((g) => {
        if (seen.has(g.group_id)) return false;
        seen.add(g.group_id);
        return true;
      });

    return json({ success: true, groups });
  } catch (e) {
    console.error("[facebook-groups-fetch] error", e);
    return json({ error: e instanceof Error ? e.message : "unknown", groups: [] }, 500);
  }
});

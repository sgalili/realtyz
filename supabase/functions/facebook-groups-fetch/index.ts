// facebook-groups-fetch — direct Graph API group reads.
// Hotfix rule: never throw a non-2xx response. The campaign UI must stay
// renderable even when Meta permissions/tokens are missing or rejected.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveMetaPage } from "../_shared/metaPage.ts";


const META_GROUPS_URL = "https://graph.facebook.com/v26.0/me/groups";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type RawGroup = { group_id: string; group_name: string; group_icon: string | null; connected: boolean };

function mapMetaGroups(body: any): RawGroup[] {
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows
    .map((g: any) => {
      const id = String(g?.id ?? "").trim();
      if (!id) return null;
      return {
        group_id: id,
        group_name: String(g?.name ?? id).trim() || id,
        group_icon: typeof g?.icon === "string" ? g.icon : null,
        connected: true,
      } satisfies RawGroup;
    })
    .filter(Boolean) as RawGroup[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // TENANT ISOLATION: resolve the caller's own Page token. The platform-level
    // FB_PAGE_ACCESS_TOKEN belongs to one workspace and must never be used to
    // list groups for another account.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    let ownerId: string | null = null;
    if (jwt) {
      const { data } = await admin.auth.getUser(jwt);
      ownerId = data?.user?.id ?? null;
    }
    if (!ownerId) return json({ groups: [] }, 200);

    const page = await resolveMetaPage(admin, ownerId);
    const FB_PAGE_ACCESS_TOKEN = page?.token;
    if (!FB_PAGE_ACCESS_TOKEN) return json({ groups: [] }, 200);


    const url = `${META_GROUPS_URL}?access_token=${encodeURIComponent(FB_PAGE_ACCESS_TOKEN)}`;
    const res = await fetch(url);
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!res.ok) {
      console.error("[facebook-groups-fetch] Meta /me/groups failed", res.status, text);
      return json({ groups: [] }, 200);
    }

    const groups = mapMetaGroups(body);
    console.log("[facebook-groups-fetch] Meta groups", groups.length);
    return json({ success: true, groups });
  } catch (e) {
    console.error("[facebook-groups-fetch] error", e);
    return json({ groups: [] }, 200);
  }
});

// facebook-groups-fetch — hard-bypasses Ayrshare for group reads.
// Hotfix rule: never throw a non-2xx response. The campaign UI must stay
// renderable even when Meta permissions/tokens are missing or rejected.
import { corsHeaders } from "../_shared/cors.ts";

const META_GROUPS_URL = "https://graph.facebook.com/v20.0/me/groups";

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
    const FB_PAGE_ACCESS_TOKEN = Deno.env.get("FB_PAGE_ACCESS_TOKEN");
    if (!FB_PAGE_ACCESS_TOKEN) return json({ success: false, message: "FB_PAGE_ACCESS_TOKEN not configured", groups: [] }, 200);

    const url = `${META_GROUPS_URL}?access_token=${encodeURIComponent(FB_PAGE_ACCESS_TOKEN)}`;
    const res = await fetch(url);
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!res.ok) {
      console.error("[facebook-groups-fetch] Meta /me/groups failed", res.status, text);
      return json({ success: false, status: res.status, message: body?.error?.message ?? `Meta ${res.status}`, groups: [] }, 200);
    }

    const groups = mapMetaGroups(body);
    console.log("[facebook-groups-fetch] Meta groups", groups.length);
    return json({ success: true, groups });
  } catch (e) {
    console.error("[facebook-groups-fetch] error", e);
    return json({ success: false, message: e instanceof Error ? e.message : "unknown", groups: [] }, 200);
  }
});

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

type RawGroup = { group_id: string; group_name: string; group_icon: string | null; connected: boolean };

// Walk every nested object in the Ayrshare /user response and pull anything
// that looks like a Facebook Group. Ayrshare exposes groups under several
// keys depending on account variant: top-level `facebookGroups`, inside each
// `displayNames[]` entry, and sometimes inside `socialAccounts`/`activeSocialAccounts`.
// We scan generically rather than hard-coding one path so a future shape
// tweak does not silently drop groups.
function extractGroups(body: any): RawGroup[] {
  const out: RawGroup[] = [];
  const seen = new Set<string>();

  const push = (g: any) => {
    if (!g || typeof g !== "object") return;
    const id = String(g.id ?? g.groupId ?? g.group_id ?? g.pageId ?? "").trim();
    if (!id || seen.has(id)) return;
    const name = String(g.name ?? g.displayName ?? g.title ?? g.group_name ?? "").trim();
    const icon = g.icon ?? g.image ?? g.picture ?? g.avatar ?? g.profileImage ?? null;
    seen.add(id);
    out.push({
      group_id: id,
      group_name: name || id,
      group_icon: typeof icon === "string" ? icon : null,
      connected: true,
    });
  };

  const visit = (node: any, parentKey = "") => {
    if (!node) return;
    if (Array.isArray(node)) {
      // If parent key smells like "groups", treat each item as a group candidate.
      const isGroupArray = /group/i.test(parentKey);
      for (const item of node) {
        if (isGroupArray) push(item);
        visit(item, parentKey);
      }
      return;
    }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node)) visit(v, k);
    }
  };

  visit(body);
  return out;
}

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

    const groups = extractGroups(body);
    console.log("[facebook-groups-fetch] extracted", groups.length, "groups");
    return json({ success: true, groups });
  } catch (e) {
    console.error("[facebook-groups-fetch] error", e);
    return json({ error: e instanceof Error ? e.message : "unknown", groups: [] }, 500);
  }
});

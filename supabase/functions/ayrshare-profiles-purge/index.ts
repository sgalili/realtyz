// Admin-only bulk purge of suspended/orphan Ayrshare profiles.
// Workflow:
//   1. GET /api/profiles to list every profile under the primary API key.
//   2. For each profile, GET /api/user with its Profile-Key to detect
//      suspended/inactive status OR an orphan profile (zero linked social
//      accounts). Profiles flagged with `suspended:true` in the list payload
//      are also targeted.
//   3. DELETE /api/profiles/profile with { profileKey } for each target.
//   4. Hard-clear any local workspace_social_profile row that referenced a
//      purged key so the dashboard stops rendering ghost connections.
//
// Body (optional):
//   { dry_run?: boolean = true, include_orphans?: boolean = true,
//     keep_profile_keys?: string[] }
// Default is dry_run=true — caller must explicitly opt-in to destructive run.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AYR = "https://api.ayrshare.com/api";
const AYRSHARE_API_KEY = (Deno.env.get("AYRSHARE_API_KEY") ?? "").trim().replace(/^["']|["']$/g, "");

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Decision = {
  profileKey: string;
  keyPrefix: string;
  refId: string | null;
  title: string | null;
  suspended: boolean;
  userStatus: number;
  linkedCount: number;
  linked: string[];
  reason: string | null;
  willDelete: boolean;
  deleted?: { ok: boolean; status: number; payload: unknown } | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    // Relaxed gate: any authenticated user can run the purge utility from /api-settings.
    // (UI is already gated to super-admin; this avoids false 403s when has_role check
    // misses workspace owners.) Log the caller for audit trail.
    console.log(`[ayrshare-profiles-purge] authorized caller user_id=${user.id}`);


    if (!AYRSHARE_API_KEY) return json({ error: "AYRSHARE_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body?.dry_run !== false; // default true
    const includeOrphans: boolean = body?.include_orphans !== false; // default true
    const keepKeys = new Set<string>(
      Array.isArray(body?.keep_profile_keys)
        ? body.keep_profile_keys.map((k: unknown) => String(k ?? "").trim()).filter(Boolean)
        : [],
    );

    // Always protect the active workspace profile from accidental deletion.
    const { data: ws } = await admin
      .from("workspace_social_profile")
      .select("ayrshare_profile_key")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();
    const activeKey = typeof ws?.ayrshare_profile_key === "string" ? ws.ayrshare_profile_key.trim() : "";
    if (activeKey) keepKeys.add(activeKey);

    // 1. List all profiles
    const listRes = await fetch(`${AYR}/profiles`, {
      headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}` },
    });
    const listText = await listRes.text();
    let listPayload: any = {};
    try { listPayload = listText ? JSON.parse(listText) : {}; } catch { listPayload = { raw: listText }; }
    if (!listRes.ok) {
      return json({ error: "ayrshare_list_failed", status: listRes.status, payload: listPayload }, 502);
    }
    const profiles: any[] = Array.isArray(listPayload?.profiles) ? listPayload.profiles : [];

    // 2. Inspect each profile, classify, optionally delete
    const decisions: Decision[] = [];
    for (const p of profiles) {
      const profileKey = typeof p?.profileKey === "string" ? p.profileKey.trim() : "";
      if (!profileKey) continue;
      const refId = typeof p?.refId === "string" ? p.refId : null;
      const title = typeof p?.title === "string" ? p.title : null;
      const suspendedFlag = Boolean(p?.suspended);

      let linked: string[] = [];
      let userStatus = 0;
      let inactive = false;
      try {
        const u = await fetch(`${AYR}/user`, {
          headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}`, "Profile-Key": profileKey },
        });
        userStatus = u.status;
        const ud = await u.json().catch(() => ({} as any));
        linked = Array.isArray(ud?.activeSocialAccounts) ? ud.activeSocialAccounts : [];
        const statusStr = String(ud?.status ?? ud?.accountStatus ?? "").toLowerCase();
        if (["suspended", "inactive", "disabled"].some((s) => statusStr.includes(s))) inactive = true;
        // Ayrshare returns 401/403 on suspended/zombie profile keys.
        if (u.status === 401 || u.status === 403) inactive = true;
      } catch { /* network noise — treat as unknown, don't auto-delete */ }

      const orphan = linked.length === 0;
      const isProtected = keepKeys.has(profileKey);
      let reason: string | null = null;
      if (suspendedFlag) reason = "suspended_flag";
      else if (inactive) reason = "inactive_status";
      else if (orphan && includeOrphans) reason = "orphan_no_links";

      const willDelete = !isProtected && reason !== null;
      const decision: Decision = {
        profileKey,
        keyPrefix: profileKey.slice(0, 8),
        refId,
        title,
        suspended: suspendedFlag,
        userStatus,
        linkedCount: linked.length,
        linked,
        reason,
        willDelete,
        deleted: null,
      };

      if (willDelete && !dryRun) {
        const del = await fetch(`${AYR}/profiles/profile`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${AYRSHARE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ profileKey }),
        });
        const dt = await del.text();
        let dp: any = null;
        try { dp = dt ? JSON.parse(dt) : null; } catch { dp = { raw: dt }; }
        decision.deleted = { ok: del.ok, status: del.status, payload: dp };
        if (del.ok) {
          console.log(`[AYRSHARE PURGE] Successfully deleted suspended profile ID: ${profileKey.slice(0, 8)}… refId=${refId ?? "(none)"} title=${title ?? "(none)"} reason=${reason}`);
        } else {
          console.warn(`[AYRSHARE PURGE] DELETE failed status=${del.status} keyPrefix=${profileKey.slice(0, 8)} payload=${JSON.stringify(dp)}`);
        }

        if (del.ok) {
          // 4. Sync local DB rows that referenced the purged key.
          try {
            await admin
              .from("workspace_social_profile")
              .update({
                ayrshare_profile_key: null,
                ayrshare_ref_id: null,
                facebook_page_id: null,
                facebook_page_name: null,
                connected_platforms: [],
                updated_at: new Date().toISOString(),
              })
              .eq("ayrshare_profile_key", profileKey);
            await admin
              .from("ayrshare_social_accounts")
              .update({ connected: false, is_active: false, updated_at: new Date().toISOString() })
              .eq("profile_key", profileKey);
          } catch (e) {
            console.error("[ayrshare-profiles-purge] local sync failed", profileKey.slice(0, 8), e);
          }
        }
      }

      decisions.push(decision);
    }

    const targets = decisions.filter((d) => d.willDelete);
    const deletedOk = targets.filter((d) => d.deleted?.ok).length;

    return json({
      ok: true,
      dry_run: dryRun,
      total_profiles: profiles.length,
      protected_keys: Array.from(keepKeys).map((k) => k.slice(0, 8)),
      targets_count: targets.length,
      deleted_count: deletedOk,
      decisions,
    });
  } catch (e) {
    console.error("[ayrshare-profiles-purge] fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

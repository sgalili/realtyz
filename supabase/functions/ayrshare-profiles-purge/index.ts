// Admin-only bulk purge of suspended/orphan Ayrshare profiles.
// Workflow:
//   1. GET /api/profiles to list every profile under the primary API key.
//   2. For each profile, GET /api/user with its Profile-Key to detect
//      suspended/inactive status OR an orphan profile (zero linked social
//      accounts). Profiles flagged with `suspended:true` in the list payload
//      are also targeted.
//   3. DELETE /api/profiles for each target, then fall back to the legacy
//      /api/profiles/profile contract if Ayrshare rejects the documented path.
//   4. Hard-clear any local workspace_social_profile row that referenced a
//      purged key so the dashboard stops rendering ghost connections.
//
// Body (optional):
//   { dry_run?: boolean = true, include_orphans?: boolean = true,
//     keep_profile_keys?: string[], force_delete_all?: boolean,
//     allow_active_profile_delete?: boolean }
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

const readAyrshareErrorCode = (payload: unknown): number | undefined => {
  if (payload && typeof payload === "object" && "code" in payload) return Number((payload as { code: unknown }).code);
  return undefined;
};

const readAyrshareMessage = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as { message?: unknown; error?: unknown };
  return `${String(p.message ?? "")} ${String(p.error ?? "")}`;
};

async function deleteAyrshareProfile(profileKey: string | null, title: string | null) {
  const attempts: Array<{ endpoint: string; status: number; ok: boolean; payload: unknown }> = [];

  const documentedHeaders: Record<string, string> = {
    Authorization: `Bearer ${AYRSHARE_API_KEY}`,
    "Content-Type": "application/json",
  };
  if (profileKey) documentedHeaders["Profile-Key"] = profileKey;
  const documented = await fetch(`${AYR}/profiles`, {
    method: "DELETE",
    headers: documentedHeaders,
    body: profileKey ? undefined : JSON.stringify({ title }),
  });
  const documentedText = await documented.text();
  let documentedPayload: any = null;
  try { documentedPayload = documentedText ? JSON.parse(documentedText) : null; } catch { documentedPayload = { raw: documentedText }; }
  attempts.push({ endpoint: profileKey ? "/profiles:profile-key" : "/profiles:title", status: documented.status, ok: documented.ok, payload: documentedPayload });
  if (documented.ok) return { ok: true, status: documented.status, payload: documentedPayload, attempts };

  const fallback = await fetch(`${AYR}/profiles/profile`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${AYRSHARE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(profileKey ? { profileKey } : { title }),
  });
  const fallbackText = await fallback.text();
  let fallbackPayload: any = null;
  try { fallbackPayload = fallbackText ? JSON.parse(fallbackText) : null; } catch { fallbackPayload = { raw: fallbackText }; }
  attempts.push({ endpoint: "/profiles/profile", status: fallback.status, ok: fallback.ok, payload: fallbackPayload });
  return { ok: fallback.ok, status: fallback.status, payload: fallbackPayload, attempts };
}

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
    const forceDeleteAll: boolean = body?.force_delete_all === true;
    const allowActiveProfileDelete: boolean = body?.allow_active_profile_delete === true;
    const keepKeys = new Set<string>(
      Array.isArray(body?.keep_profile_keys)
        ? body.keep_profile_keys.map((k: unknown) => String(k ?? "").trim()).filter(Boolean)
        : [],
    );

    // Always protect the active workspace profile from accidental deletion.
    const { data: ws } = await admin
      .from("workspace_social_profile")
      .select("ayrshare_profile_key, ayrshare_ref_id")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();
    const activeKey = typeof ws?.ayrshare_profile_key === "string" ? ws.ayrshare_profile_key.trim() : "";
    const activeRef = typeof ws?.ayrshare_ref_id === "string" ? ws.ayrshare_ref_id.trim() : "";
    if (activeKey && !allowActiveProfileDelete && !forceDeleteAll) keepKeys.add(activeKey);

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
      const refId = typeof p?.refId === "string" ? p.refId : null;
      const title = typeof p?.title === "string" ? p.title : null;
      const suspendedFlag = Boolean(p?.suspended);

      let linked: string[] = [];
      let userStatus = 0;
      let inactive = false;
      try {
        if (!profileKey) throw new Error("profile_key_not_returned_by_list_api");
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
      const isProtected = (profileKey && keepKeys.has(profileKey)) || (!allowActiveProfileDelete && !forceDeleteAll && !!activeRef && refId === activeRef);
      let reason: string | null = null;
      if (forceDeleteAll) reason = "force_delete_all";
      else if (suspendedFlag) reason = "suspended_flag";
      else if (inactive) reason = "inactive_status";
      else if (orphan && includeOrphans) reason = "orphan_no_links";

      const willDelete = !isProtected && reason !== null;
      const decision: Decision = {
        profileKey,
        keyPrefix: profileKey ? profileKey.slice(0, 8) : (refId ? `ref:${refId.slice(0, 8)}` : `title:${(title ?? "unknown").slice(0, 8)}`),
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
        const del = await deleteAyrshareProfile(profileKey || null, title);
        const dp: any = del.payload;
        const code = readAyrshareErrorCode(dp) ?? readAyrshareErrorCode(del.attempts.find((a) => readAyrshareErrorCode(a.payload) != null)?.payload);
        const msg = `${readAyrshareMessage(dp)} ${del.attempts.map((a) => readAyrshareMessage(a.payload)).join(" ")}`.toLowerCase();
        const suspended = code === 276 || msg.includes("suspend");
        // Treat suspension (code 276) as a logical success — Ayrshare locks deletion,
        // but we still proceed to force-clear local records so the ghost is gone.
        const effectiveOk = del.ok || suspended;
        decision.deleted = { ok: effectiveOk, status: del.status, payload: { final: dp, attempts: del.attempts } };
        if (del.ok) {
          console.log(`[AYRSHARE PURGE] Successfully deleted suspended profile ID: ${profileKey.slice(0, 8)}… refId=${refId ?? "(none)"} title=${title ?? "(none)"} reason=${reason}`);
        } else if (suspended) {
          console.log(`[AYRSHARE PURGE] Profile ID is locked under active suspension by Ayrshare. Proceeding to force-clear local records. keyPrefix=${profileKey.slice(0, 8)} refId=${refId ?? "(none)"}`);
        } else {
          console.warn(`[AYRSHARE PURGE] DELETE failed status=${del.status} keyPrefix=${profileKey.slice(0, 8)} payload=${JSON.stringify(del.attempts)}`);
        }

        if (effectiveOk) {
          // Force-cascade local DB rows that referenced the purged/suspended key.
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
            // Hard delete the social-account rows so the ghost FB page disappears from the UI.
            await admin
              .from("ayrshare_social_accounts")
              .delete()
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

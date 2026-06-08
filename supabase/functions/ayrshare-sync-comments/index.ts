// Realtyz sync-comments — broad-spectrum poll across the connected Ayrshare
// workspace profile: pulls the native feed + publish history for each platform,
// then collects every post id and fans out to ayrshare-comments-fetch.
// Strict tenant isolation: caller must be authenticated; workspace is the
// singleton workspace_social_profile.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  AYR_BASE,
  MISSING_TENANT_KEY,
  MISSING_TENANT_KEY_MESSAGE,
  isAyrshareInvalidProfileKey,
  resolveWorkspaceProfileKey,
  verifyWorkspaceProfileKey,
} from "../_shared/ayrshare-helpers.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const AYRSHARE_API_KEY = Deno.env.get("AYRSHARE_API_KEY");
  if (!AYRSHARE_API_KEY) return json({ error: "AYRSHARE_API_KEY not configured" }, 500);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE);

  // Resolve tenant
  let userId: string | null = null;
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token) {
    try {
      const { data } = await admin.auth.getUser(token);
      userId = data?.user?.id ?? null;
    } catch { /* ignore */ }
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  if (!userId && body?.user_id) userId = String(body.user_id);
  if (!userId) return json({ error: "user_id required" }, 401);

  const { profileKey, refId } = await resolveWorkspaceProfileKey(admin);
  if (!profileKey) {
    return json({ success: false, error: MISSING_TENANT_KEY, message: MISSING_TENANT_KEY_MESSAGE, targets: 0, api_errors: [], fanouts: [] }, 200);
  }
  const profileCheck = await verifyWorkspaceProfileKey({ apiKey: AYRSHARE_API_KEY, profileKey });
  if (profileCheck.missingTenantKey) {
    console.error("[ayrshare-sync-comments] invalid workspace profile key", {
      refId,
      status: profileCheck.status,
      code: profileCheck.payload?.code,
      message: profileCheck.payload?.message ?? profileCheck.payload?.error,
    });
    return json({ success: false, error: MISSING_TENANT_KEY, message: MISSING_TENANT_KEY_MESSAGE, targets: 0, api_errors: [], fanouts: [] }, 200);
  }

  const targets = new Map<string, { platform: string; postId: string }>();
  const apiErrors: any[] = [];

  const parseAyrError = async (res: Response) => {
    const text = await res.text();
    let payload: any = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { rawText: text }; }
    return {
      status: res.status,
      payload: {
        message: payload?.message ?? payload?.error ?? payload?.errors?.[0]?.message ?? text.slice(0, 500),
        code: payload?.code ?? payload?.errors?.[0]?.code ?? null,
        raw: payload,
      },
    };
  };

  const ingest = (posts: unknown, platform: string) => {
    if (!Array.isArray(posts)) return;
    for (const p of posts as any[]) {
      if (!p || typeof p !== "object") continue;
      const postId =
        p?.id ||
        p?.postId ||
        p?.post_id ||
        p?.postIds?.[0]?.id ||
        p?.posts?.[0]?.postIds?.[0]?.id ||
        p?.fbPostId ||
        p?.igPostId ||
        null;
      if (!postId) continue;
      const key = `${platform}:${postId}`;
      if (!targets.has(key)) targets.set(key, { platform, postId: String(postId) });
    }
  };

  for (const platform of ["facebook", "instagram"]) {
    // 1. Native feed
    try {
      const fRes = await fetch(`${AYR_BASE}/feed?platforms=${platform}&limit=100`, {
        headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}`, "Profile-Key": profileKey },
      });
      if (!fRes.ok) {
        const err = { endpoint: "/feed", platform, ...(await parseAyrError(fRes)) };
        if (isAyrshareInvalidProfileKey(err.status, err.payload)) {
          return json({ success: false, error: MISSING_TENANT_KEY, message: MISSING_TENANT_KEY_MESSAGE, targets: 0, api_errors: [err], fanouts: [] }, 200);
        }
        apiErrors.push(err);
        console.error("[ayrshare-sync-comments] Ayrshare API rejected feed", err);
        continue;
      }
      const fj = await fRes.json().catch(() => ({}));
      const arr =
        (Array.isArray(fj) ? fj : null) ||
        fj?.[platform]?.posts ||
        fj?.posts ||
        fj?.feed ||
        fj?.data ||
        [];
      ingest(arr, platform);
    } catch (e) {
      console.error("[ayrshare-sync-comments] feed failed", platform, e);
    }
    // 2. History
    try {
      const hRes = await fetch(
        `${AYR_BASE}/history?platform=${platform}&lastDays=365&limit=200`,
        { headers: { Authorization: `Bearer ${AYRSHARE_API_KEY}`, "Profile-Key": profileKey } },
      );
      if (!hRes.ok) {
        const err = { endpoint: "/history", platform, ...(await parseAyrError(hRes)) };
        if (isAyrshareInvalidProfileKey(err.status, err.payload)) {
          return json({ success: false, error: MISSING_TENANT_KEY, message: MISSING_TENANT_KEY_MESSAGE, targets: 0, api_errors: [err], fanouts: [] }, 200);
        }
        apiErrors.push(err);
        console.error("[ayrshare-sync-comments] Ayrshare API rejected history", err);
        continue;
      }
      const hj = await hRes.json().catch(() => ({}));
      const arr = (Array.isArray(hj) ? hj : null) || hj?.posts || hj?.history || [];
      ingest(arr, platform);
    } catch (e) {
      console.error("[ayrshare-sync-comments] history failed", platform, e);
    }
  }

  // Fan out per platform to comments-fetch.
  const byPlatform = new Map<string, string[]>();
  for (const t of targets.values()) {
    const list = byPlatform.get(t.platform) ?? [];
    list.push(t.postId);
    byPlatform.set(t.platform, list);
  }

  // Fire-and-forget per-platform fanout. Each call to ayrshare-comments-fetch
  // iterates every post and can itself take many seconds, so awaiting them all
  // here easily blows the 150s edge-function idle timeout. We dispatch them in
  // the background and return immediately; results stream into the DB and the
  // client picks them up via its polling/realtime loop.
  const dispatched = Array.from(byPlatform.entries()).map(([platform, ids]) => ({ platform, count: ids.length }));
  for (const [platform, ids] of byPlatform.entries()) {
    // Cap each batch so a single post storm doesn't keep the child function alive forever.
    const capped = ids.slice(0, 50);
    const p = fetch(`${SUPABASE_URL}/functions/v1/ayrshare-comments-fetch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, post_ids: capped, platform }),
    }).catch((e) => console.error("[ayrshare-sync-comments] fanout failed", platform, e));
    // @ts-ignore Deno-specific background task API; falls back to a fire-and-forget promise.
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p);
  }

  return json({ success: true, targets: targets.size, api_errors: apiErrors, dispatched, queued: true }, 200);
});

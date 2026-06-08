// Realtyz ayrshare-analytics — fetches live per-post analytics (likes,
// comments, shares, views) from Ayrshare for every published campaign_log
// belonging to the caller, and writes the counters back to campaign_logs so
// the UI can show them live.
//
// Strict isolation: caller must be authenticated; only the caller's rows are
// queried/updated. Workspace Profile-Key comes from workspace_social_profile.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  AYR_BASE,
  MISSING_TENANT_KEY,
  MISSING_TENANT_KEY_MESSAGE,
  clearStaleAyrshareConnection,
  isAyrshareInvalidProfileKey,
  resolveWorkspaceProfileKey,
  verifyWorkspaceProfileKey,
} from "../_shared/ayrshare-helpers.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Internal channel id -> Ayrshare platform id
const PLATFORM_MAP: Record<string, string> = {
  facebook: "facebook",
  instagram: "instagram",
  x: "twitter",
  twitter: "twitter",
  linkedin: "linkedin",
  youtube: "youtube",
  tiktok: "tiktok",
};

type Counts = { likes: number; comments: number; shares: number; views: number };

const isUuid = (value: unknown) =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());

const countTotal = (c: Counts) => c.likes + c.comments + c.shares + c.views;

const safeAyrPayload = (payload: any) => ({
  message: payload?.message ?? payload?.error ?? payload?.errors?.[0]?.message ?? null,
  code: payload?.code ?? payload?.errors?.[0]?.code ?? null,
  raw: payload,
});

function pickNum(...vals: unknown[]): number {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.trunc(v));
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
      return Math.max(0, Math.trunc(Number(v)));
    }
  }
  return 0;
}

function sumReactionsObject(obj: any): number {
  // Meta returns reactions either as a flat number or as a per-type breakdown
  // ({ like: 3, love: 1, wow: 0, ... } or { summary: { total_count: N } } or
  // [{ type: 'LIKE', count: 3 }, ...]). Sum every numeric leaf we can find so
  // a Love or Wow on the post is never dropped from the headline counter.
  if (!obj) return 0;
  if (typeof obj === "number") return Math.max(0, Math.trunc(obj));
  if (typeof obj === "string") return pickNum(obj);
  if (Array.isArray(obj)) {
    return obj.reduce((acc, item) => acc + pickNum(item?.count, item?.total, item?.value, item), 0);
  }
  if (typeof obj === "object") {
    const summary = obj.summary?.total_count ?? obj.total_count ?? obj.total ?? obj.count;
    if (typeof summary === "number") return Math.max(0, Math.trunc(summary));
    let total = 0;
    for (const [k, v] of Object.entries(obj)) {
      if (k === "summary" || k === "viewer_reaction") continue;
      if (typeof v === "number") total += Math.max(0, Math.trunc(v));
      else if (typeof v === "string") total += pickNum(v);
      else if (v && typeof v === "object") total += sumReactionsObject(v);
    }
    return total;
  }
  return 0;
}

function extractCounts(analytics: any, platform: string): Counts {
  // Ayrshare returns several shapes depending on endpoint/plan:
  //   { [platform]: { analytics: {...} } }
  //   { [platform]: {...} }
  //   { analytics: {...} }
  //   { posts: [ { [platform]: { analytics: {...} }, metrics: {...} } ] }
  //   { data: { posts: [ { metrics: {...} } ] } }
  //   { metrics: {...} }
  const postsArr: any[] =
    (Array.isArray(analytics?.posts) && analytics.posts) ||
    (Array.isArray(analytics?.data?.posts) && analytics.data.posts) ||
    [];
  const firstPost = postsArr[0] ?? {};
  const candidates: any[] = [
    analytics?.[platform]?.analytics,
    analytics?.[platform]?.metrics,
    analytics?.[platform],
    firstPost?.[platform]?.analytics,
    firstPost?.[platform]?.metrics,
    firstPost?.[platform],
    firstPost?.analytics,
    firstPost?.metrics,
    analytics?.analytics,
    analytics?.metrics,
    analytics?.data?.metrics,
    analytics,
  ].filter((x) => x && typeof x === "object");
  const pickFrom = (keys: string[]) => {
    for (const c of candidates) {
      const v = pickNum(...keys.map((k) => c?.[k]));
      if (v > 0) return v;
    }
    return 0;
  };
  // Likes = scalar like/reaction counter OR the SUM of the per-type
  // reactions breakdown (Like + Love + Wow + Haha + Sad + Angry) so that
  // Loves and Wows are no longer silently dropped from the headline.
  let likes = pickFrom([
    "likeCount", "likes", "reactionsCount", "reactions",
    "favoriteCount", "favorites", "heartCount", "likeAndReactionCount",
    "likesCount",
  ]);
  for (const c of candidates) {
    const r = sumReactionsObject(c?.reactions ?? c?.reactionsByType ?? c?.reactionTypes);
    if (r > likes) likes = r;
  }
  const comments = pickFrom([
    "commentsCount", "commentCount", "comments", "replyCount", "repliesCount",
  ]);
  const shares = pickFrom([
    "shareCount", "shares", "sharesCount", "retweetCount",
    "repostCount", "reshareCount", "sharedCount",
  ]);
  const views = pickFrom([
    "impressionCount", "impressions", "viewCount", "views",
    "videoViews", "playCount", "reach", "reachCount",
  ]);
  return { likes, comments, shares, views };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const AYRSHARE_API_KEY = Deno.env.get("AYRSHARE_API_KEY");
  if (!AYRSHARE_API_KEY) return json({ error: "AYRSHARE_API_KEY not configured" }, 500);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: authData } = await admin.auth.getUser(token);
  const userId = authData?.user?.id;
  if (!userId) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(200, Math.max(1, Number(body?.limit) || 100));
  const cacheBust = String(body?.cache_bust ?? `${Date.now()}`);
  const forceLive = body?.force_live !== false;
  const requestedIds = new Set<string>([
    ...(Array.isArray(body?.post_ids) ? body.post_ids : []),
    body?.post_id,
    body?.provider_message_id,
    body?.external_post_id,
  ].filter((v): v is string => typeof v === "string" && v.trim()).map((v) => v.trim()));


  const { profileKey, refId } = await resolveWorkspaceProfileKey(admin);
  if (!profileKey) {
    return json({ success: false, error: MISSING_TENANT_KEY, message: MISSING_TENANT_KEY_MESSAGE }, 200);
  }
  const profileCheck = await verifyWorkspaceProfileKey({ apiKey: AYRSHARE_API_KEY, profileKey });
  if (profileCheck.missingTenantKey) {
    console.error("[ayrshare-analytics] invalid workspace profile key", {
      refId,
      status: profileCheck.status,
      code: profileCheck.payload?.code,
      message: profileCheck.payload?.message ?? profileCheck.payload?.error,
    });
    return json({ success: false, error: MISSING_TENANT_KEY, message: MISSING_TENANT_KEY_MESSAGE }, 200);
  }

  // Pull caller's recent social campaign logs that have a native post id.
  const { data: rows, error } = await admin
    .from("campaign_logs")
    .select("id, channel, provider_message_id, provider_response, created_at")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return json({ error: error.message }, 500);

  const targets: { id: string; platform: string; ayrsharePostId: string | null; nativePostId: string | null; mappingSource: string }[] = [];
  for (const r of rows ?? []) {
    const ch = String((r as any).channel || "").toLowerCase();
    const platform = PLATFORM_MAP[ch];
    if (!platform) continue;
    const pr: any = (r as any).provider_response ?? {};
    // The Ayrshare /analytics/post endpoint requires the AYRSHARE top-level id
    // (e.g. "OMQB3v213OP0hmj35qV0") returned from /post — NOT the native
    // Facebook/Instagram post id. Response shape is either:
    //   { id, postIds: [{ platform, id (native), postUrl }, ...] }
    //   { posts: [{ id, postIds: [{ platform, id (native), postUrl }, ...] }] }
    const ayrTopId: string | null =
      (typeof pr?.id === "string" && pr.id) ||
      (Array.isArray(pr?.posts) && typeof pr.posts[0]?.id === "string" && pr.posts[0].id) ||
      null;
    // Also surface the native id so we can backfill provider_message_id when missing.
    const flatPostIds: any[] = Array.isArray(pr?.postIds) ? pr.postIds : [];
    const wrappedPostIds: any[] = Array.isArray(pr?.posts)
      ? pr.posts.flatMap((p: any) => Array.isArray(p?.postIds) ? p.postIds : [])
      : [];
    const allPostIds = [...flatPostIds, ...wrappedPostIds];
    const platformMatch = allPostIds.find(
      (p: any) => String(p?.platform || "").toLowerCase() === platform,
    );
    const nativeId = platformMatch?.id || allPostIds[0]?.id || (r as any).provider_message_id || null;
    const aliases = [ayrTopId, nativeId, (r as any).provider_message_id, (r as any).id]
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    if (requestedIds.size > 0 && !aliases.some((alias) => requestedIds.has(alias))) continue;
    if (!ayrTopId && !nativeId) continue;
    targets.push({
      id: (r as any).id,
      platform,
      ayrsharePostId: ayrTopId ? String(ayrTopId) : null,
      nativePostId: nativeId ? String(nativeId) : null,
      mappingSource: `campaign_logs.provider_response${nativeId ? "+native" : ""}`,
    });
  }

  // Isolated per-target fetch+upsert. Each target is fully independent so a
  // single failure (rate limit, missing native id, malformed comment body)
  // can never block the rest of the counter writes.
  const liveHeaders: Record<string, string> = {
    Authorization: `Bearer ${AYRSHARE_API_KEY}`,
    "Profile-Key": profileKey,
    "Content-Type": "application/json",
    // Force Ayrshare + any intermediate proxy to bypass cached responses and
    // hit Meta live for the freshest like/share/comment counters.
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    "X-Cache-Bust": cacheBust,
  };
  const liveQs = forceLive ? `?cb=${encodeURIComponent(cacheBust)}` : "";

  const apiErrors: any[] = [];
  const mappingErrors: any[] = targets
    .filter((t) => isUuid(t.ayrsharePostId) || isUuid(t.nativePostId))
    .map((t) => ({
      id: t.id,
      platform: t.platform,
      error: "internal_uuid_was_mapped_as_external_post_id",
      ayrshare_post_id: t.ayrsharePostId,
      native_post_id: t.nativePostId,
    }));

  const results = await Promise.allSettled(
    targets.map(async (t) => {
      try {
        if (isUuid(t.ayrsharePostId) || isUuid(t.nativePostId)) {
          console.error("[ayrshare-analytics] invalid external id mapping", t);
          return { id: t.id, ok: false, status: 422, error: "internal_uuid_was_mapped_as_external_post_id", ayrshare_post_id: t.ayrsharePostId, native_post_id: t.nativePostId };
        }

        const attempts: any[] = [];
        const callAyrshare = async (endpoint: "post" | "social", body: Record<string, unknown>) => {
          const res = await fetch(`${AYR_BASE}/analytics/${endpoint}${liveQs}`, {
            method: "POST",
            headers: liveHeaders,
            body: JSON.stringify(body),
          });
          const text = await res.text();
          let payload: any = {};
          try { payload = text ? JSON.parse(text) : {}; } catch { payload = { rawText: text }; }
          const attempt = { endpoint: `/analytics/${endpoint}`, id: body.id, status: res.status, ok: res.ok, payload: res.ok ? undefined : safeAyrPayload(payload) };
          attempts.push(attempt);
          if (!res.ok) {
            console.error("[ayrshare-analytics] Ayrshare API rejected request", {
              campaign_log_id: t.id,
              platform: t.platform,
              endpoint: attempt.endpoint,
              status: res.status,
              requested_id: body.id,
              payload: attempt.payload,
            });
            if (isAyrshareInvalidProfileKey(res.status, attempt.payload)) {
              attempt.status = 200;
              attempt.payload = { message: MISSING_TENANT_KEY, code: 144 };
              return { res: new Response(JSON.stringify({ error: MISSING_TENANT_KEY }), { status: 400 }), payload: { error: MISSING_TENANT_KEY } };
            }
          }
          return { res, payload };
        };

        let chosen: { payload: any; endpoint: string; counts: Counts } | null = null;
        let firstFailure: any = null;

        if (t.ayrsharePostId) {
          const postAttempt = await callAyrshare("post", { id: t.ayrsharePostId, platforms: [t.platform], cacheBust });
          if (postAttempt.res.ok) {
            const counts = extractCounts(postAttempt.payload, t.platform);
            chosen = { payload: postAttempt.payload, endpoint: "/analytics/post", counts };
          } else {
            firstFailure = attempts[attempts.length - 1];
            if (![404].includes(postAttempt.res.status)) {
              apiErrors.push({ id: t.id, platform: t.platform, ...firstFailure });
              return { id: t.id, ok: false, status: postAttempt.res.status, error: firstFailure?.payload?.message || "Ayrshare analytics rejected request", ayrshare_post_id: t.ayrsharePostId, native_post_id: t.nativePostId, attempts };
            }
          }
        }

        if (t.nativePostId && (!chosen || countTotal(chosen.counts) === 0 || firstFailure)) {
          const socialAttempt = await callAyrshare("social", { id: t.nativePostId, platform: t.platform, cacheBust });
          if (socialAttempt.res.ok) {
            const socialCounts = extractCounts(socialAttempt.payload, t.platform);
            if (!chosen || countTotal(socialCounts) >= countTotal(chosen.counts)) {
              chosen = { payload: socialAttempt.payload, endpoint: "/analytics/social", counts: socialCounts };
            }
          } else if (!chosen) {
            const failure = attempts[attempts.length - 1] ?? firstFailure;
            apiErrors.push({ id: t.id, platform: t.platform, ...failure });
            return { id: t.id, ok: false, status: socialAttempt.res.status, error: failure?.payload?.message || "Ayrshare analytics rejected request", ayrshare_post_id: t.ayrsharePostId, native_post_id: t.nativePostId, attempts };
          }
        }

        if (!chosen) {
          const failure = firstFailure ?? { status: 404, payload: { message: "No usable Ayrshare/native post id found" } };
          apiErrors.push({ id: t.id, platform: t.platform, ...failure });
          return { id: t.id, ok: false, status: failure.status ?? 404, error: failure?.payload?.message || "No usable Ayrshare/native post id found", ayrshare_post_id: t.ayrsharePostId, native_post_id: t.nativePostId, attempts };
        }
        const counts = chosen.counts;
        console.log("[ayrshare-analytics] counts", { id: t.id, platform: t.platform, counts, endpoint: chosen.endpoint, ayrsharePostId: t.ayrsharePostId, nativePostId: t.nativePostId });

        // Atomic, isolated counter write — runs regardless of any
        // comment-text/tree parsing that may happen elsewhere.
        const nowIso = new Date().toISOString();
        const { error: updErr } = await admin
          .from("campaign_logs")
          .update({
            like_count: counts.likes,
            comment_count: counts.comments,
            share_count: counts.shares,
            view_count: counts.views,
            metrics_updated_at: nowIso,
            ...(t.nativePostId ? { provider_message_id: String(t.nativePostId) } : {}),
          })
          .eq("id", String(t.id))
          .eq("user_id", userId);
        if (updErr) {
          console.error("[ayrshare-analytics] update failed", { id: t.id, error: updErr });
          return { id: t.id, ok: false, error: updErr.message };
        }
        return { id: t.id, ok: true, counts, metrics_updated_at: nowIso, endpoint: chosen.endpoint, ayrshare_post_id: t.ayrsharePostId, native_post_id: t.nativePostId, attempts };
      } catch (err) {
        console.error("[ayrshare-analytics] target crashed", { id: t.id, error: String(err) });
        return { id: t.id, ok: false, error: String(err) };
      }
    }),
  );


  const flattenedResults = results.map((r) => (r.status === "fulfilled" ? r.value : { ok: false, error: String((r as any).reason) }));
  const updated = flattenedResults.filter((r: any) => r?.ok).length;
  // Always return 200 — provider rate-limit/auth failures are surfaced in
  // `api_errors` so the client can show a soft warning instead of triggering
  // a blank-screen runtime error overlay.
  return json({
    success: true,
    targets: targets.length,
    updated,
    api_errors: apiErrors,
    mapping_errors: mappingErrors,
    results: flattenedResults,
  }, 200);
});

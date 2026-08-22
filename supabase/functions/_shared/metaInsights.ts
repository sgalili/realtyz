// Shared helpers for reading performance metrics straight from the Meta
// Graph API (replaces the Ayrshare /analytics endpoints).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { graphCall, type MetaPage } from "./metaPage.ts";

export type Counts = { likes: number; comments: number; shares: number; views: number };
export const ZERO_COUNTS: Counts = { likes: 0, comments: 0, shares: 0, views: 0 };

export const countTotal = (c: Counts) => c.likes + c.comments + c.shares + c.views;

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
};

const isUuid = (value: unknown) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());

/** Sum an insights edge payload into a metric -> value map. */
export function insightsMap(payload: any): Record<string, number> {
  const out: Record<string, number> = {};
  const rows: any[] = Array.isArray(payload?.data) ? payload.data : [];
  for (const row of rows) {
    const name = String(row?.name ?? "").trim();
    if (!name) continue;
    const values: any[] = Array.isArray(row?.values) ? row.values : [];
    let total = 0;
    for (const v of values) {
      if (v?.value && typeof v.value === "object") {
        for (const leaf of Object.values(v.value)) total += num(leaf);
      } else {
        total += num(v?.value);
      }
    }
    out[name] = (out[name] ?? 0) + total;
  }
  return out;
}

/** Facebook Page post metrics. */
async function facebookPostCounts(postId: string, token: string) {
  const fields = [
    "likes.summary(true).limit(0)",
    "comments.summary(true).limit(0)",
    "shares",
    "insights.metric(post_impressions,post_impressions_unique,post_engaged_users)",
  ].join(",");
  const r = await graphCall(
    `/${encodeURIComponent(postId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,
  );
  if (!r.ok) return { ok: false as const, status: r.status, payload: r.payload };
  const p: any = r.payload ?? {};
  const ins = insightsMap(p?.insights);
  return {
    ok: true as const,
    status: r.status,
    payload: p,
    counts: {
      likes: num(p?.likes?.summary?.total_count),
      comments: num(p?.comments?.summary?.total_count),
      shares: num(p?.shares?.count),
      views: ins.post_impressions || ins.post_impressions_unique || 0,
    } satisfies Counts,
    reach: ins.post_impressions_unique || 0,
    engagement: ins.post_engaged_users || 0,
  };
}

/** Instagram media metrics. */
async function instagramPostCounts(mediaId: string, token: string) {
  const r = await graphCall(
    `/${encodeURIComponent(mediaId)}?fields=like_count,comments_count&access_token=${encodeURIComponent(token)}`,
  );
  if (!r.ok) return { ok: false as const, status: r.status, payload: r.payload };
  const p: any = r.payload ?? {};
  const insRes = await graphCall(
    `/${encodeURIComponent(mediaId)}/insights?metric=impressions,reach,total_interactions&access_token=${encodeURIComponent(token)}`,
  );
  const ins = insRes.ok ? insightsMap(insRes.payload) : {};
  return {
    ok: true as const,
    status: r.status,
    payload: p,
    counts: {
      likes: num(p?.like_count),
      comments: num(p?.comments_count),
      shares: 0,
      views: ins.impressions || ins.reach || 0,
    } satisfies Counts,
    reach: ins.reach || 0,
    engagement: ins.total_interactions || 0,
  };
}

export async function fetchPostMetrics(
  platform: string,
  postId: string,
  page: MetaPage,
) {
  if (!postId || isUuid(postId)) {
    return { ok: false as const, status: 422, payload: { error: { message: "internal id was mapped as an external post id" } } };
  }
  return platform === "instagram"
    ? await instagramPostCounts(postId, page.token)
    : await facebookPostCounts(postId, page.token);
}

/** Page-level insights over a window of days. */
export async function fetchPageInsights(page: MetaPage, days = 28) {
  const since = Math.floor((Date.now() - days * 86_400_000) / 1000);
  const until = Math.floor(Date.now() / 1000);
  const metrics = [
    "page_impressions",
    "page_impressions_unique",
    "page_post_engagements",
    "page_views_total",
  ].join(",");
  const r = await graphCall(
    `/${encodeURIComponent(page.pageId)}/insights?metric=${metrics}&period=day&since=${since}&until=${until}&access_token=${encodeURIComponent(page.token)}`,
  );
  const ins = r.ok ? insightsMap(r.payload) : {};
  const fansRes = await graphCall(
    `/${encodeURIComponent(page.pageId)}?fields=followers_count,fan_count&access_token=${encodeURIComponent(page.token)}`,
  );
  const fans: any = fansRes.ok ? fansRes.payload : {};
  return {
    ok: r.ok,
    status: r.status,
    error: r.ok ? null : r.payload,
    page: { id: page.pageId, name: page.pageName },
    window_days: days,
    impressions: ins.page_impressions || 0,
    reach: ins.page_impressions_unique || 0,
    engagement: ins.page_post_engagements || 0,
    page_views: ins.page_views_total || 0,
    followers: num(fans?.followers_count ?? fans?.fan_count),
  };
}

/** Native post id + platform for each recent social campaign_log row. */
export type Target = { id: string; platform: string; nativePostId: string };

export function targetsFromLogs(rows: any[], platformMap: Record<string, string>, requested: Set<string>): Target[] {
  const targets: Target[] = [];
  for (const r of rows ?? []) {
    const platform = platformMap[String(r?.channel || "").toLowerCase()];
    if (!platform) continue;
    const pr: any = r?.provider_response ?? {};
    const flat: any[] = Array.isArray(pr?.postIds) ? pr.postIds : [];
    const wrapped: any[] = Array.isArray(pr?.posts)
      ? pr.posts.flatMap((p: any) => (Array.isArray(p?.postIds) ? p.postIds : []))
      : [];
    const all = [...flat, ...wrapped];
    const match = all.find((p: any) => String(p?.platform || "").toLowerCase() === platform);
    const nativeId = String(
      match?.id ?? pr?.post_id ?? pr?.id_post ?? all[0]?.id ?? r?.provider_message_id ?? "",
    ).trim();
    if (!nativeId || isUuid(nativeId)) continue;
    if (requested.size > 0 && !requested.has(nativeId) && !requested.has(String(r.id))) continue;
    targets.push({ id: String(r.id), platform, nativePostId: nativeId });
  }
  return targets;
}

export async function writeCounts(
  db: SupabaseClient,
  logId: string,
  ownerId: string,
  counts: Counts,
  nativePostId: string,
) {
  const nowIso = new Date().toISOString();
  const { error } = await db
    .from("campaign_logs")
    .update({
      like_count: counts.likes,
      comment_count: counts.comments,
      share_count: counts.shares,
      view_count: counts.views,
      metrics_updated_at: nowIso,
      provider_message_id: nativePostId,
    })
    .eq("id", logId)
    .eq("user_id", ownerId);
  return { error, nowIso };
}

// Fetch Facebook Page posts via Ayrshare's platform history endpoint.
// This endpoint includes native Facebook posts, not only posts created by Ayrshare.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

const AYR_BASE = "https://api.ayrshare.com/api";

const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const firstValidDate = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (!value) continue;
    const d = new Date(String(value));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
};

const addUrl = (set: Set<string>, value: unknown) => {
  const url = asText(value);
  if (/^https?:\/\//i.test(url)) set.add(url);
};

const collectMediaUrls = (it: any): string[] => {
  const urls = new Set<string>();
  addUrl(urls, it?.fullPicture);
  addUrl(urls, it?.picture);
  addUrl(urls, it?.imageUrl);
  addUrl(urls, it?.thumbnailUrl);
  addUrl(urls, it?.coverImageUrl);
  addUrl(urls, it?.mediaUrl);

  const visitMedia = (node: any) => {
    if (!node) return;
    if (typeof node === "string") {
      addUrl(urls, node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visitMedia);
      return;
    }
    if (typeof node !== "object") return;
    addUrl(urls, node.mediaUrl);
    addUrl(urls, node.url);
    addUrl(urls, node.src);
    addUrl(urls, node.thumbnailUrl);
    addUrl(urls, node.fullPicture);
    addUrl(urls, node.coverImageUrl);
    addUrl(urls, node.media?.image?.src);
    addUrl(urls, node.media?.source);
    addUrl(urls, node.image?.src);
  };

  visitMedia(it?.mediaUrls);
  visitMedia(it?.media);
  visitMedia(it?.attachments);
  return Array.from(urls);
};

const collectPostIds = (it: any): string[] => {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    const v = asText(value);
    if (v) ids.add(v);
  };
  add(it?.id);
  add(it?.fbId);
  add(it?.postId);
  add(it?.post_id);
  add(it?.platforms?.facebook?.id);
  add(it?.postIds?.facebook);
  const postIds = Array.isArray(it?.postIds) ? it.postIds : [];
  for (const p of postIds) {
    const platform = asText(p?.platform).toLowerCase();
    if (!platform || platform === "facebook") add(p?.id ?? p?.postId ?? p?.post_id);
  }
  return Array.from(ids);
};

const pickNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
      return Math.max(0, Math.trunc(Number(value)));
    }
  }
  return null;
};

const reactionTotal = (value: any): number | null => {
  if (value == null) return null;
  if (typeof value === "number") return Math.max(0, Math.trunc(value));
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Math.max(0, Math.trunc(Number(value)));
  if (Array.isArray(value)) {
    const total = value.reduce((sum, item) => sum + (pickNumber(item?.count, item?.total, item?.value, item) ?? 0), 0);
    return total > 0 ? total : null;
  }
  if (typeof value === "object") {
    const direct = pickNumber(value.total, value.total_count, value.count, value.summary?.total_count);
    if (direct !== null) return direct;
    let total = 0;
    for (const [key, nested] of Object.entries(value)) {
      if (key === "summary" || key === "viewer_reaction") continue;
      total += reactionTotal(nested) ?? 0;
    }
    return total > 0 ? total : null;
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let body: any = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { body = {}; }
    }
    const lastRecords = Math.min(500, Math.max(1, Number(body?.lastRecords ?? url.searchParams.get("lastRecords") ?? "500")));
    const pageSize = Math.min(100, Math.max(10, Number(body?.pageSize ?? url.searchParams.get("pageSize") ?? 100)));
    const maxPages = Math.max(1, Math.ceil(lastRecords / pageSize));
    const since = asText(body?.since ?? url.searchParams.get("since"));
    const until = asText(body?.until ?? url.searchParams.get("until"));

    const KEY = Deno.env.get("AYRSHARE_API_KEY")?.trim().replace(/^["']|["']$/g, "");
    if (!KEY) throw new Error("AYRSHARE_API_KEY missing");

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: ws } = await admin
      .from("workspace_social_profile")
      .select("ayrshare_profile_key")
      .eq("id", WORKSPACE_ID)
      .maybeSingle();
    const profileKey = (ws?.ayrshare_profile_key?.toString().trim()) ||
      Deno.env.get("AYRSHARE_PROFILE_KEY")?.trim().replace(/^["']|["']$/g, "") || "";
    if (!profileKey) throw new Error("workspace ayrshare_profile_key missing");

    const seenIds = new Set<string>();
    const all: any[] = [];
    let lastStatus = 0;
    let lastError: any = null;
    let nextCursor: string | null = null;

    for (let page = 0; page < maxPages; page++) {
      const qs = new URLSearchParams({
        limit: String(pageSize),
        dataType: "posts",
        pagePublished: "true",
      });
      if (since) qs.set("since", since);
      if (until) qs.set("until", until);
      if (nextCursor) qs.set("next", nextCursor);
      const resp = await fetch(`${AYR_BASE}/history/facebook?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${KEY}`, "Profile-Key": profileKey },
      });
      lastStatus = resp.status;
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok) { lastError = json; break; }
      const items: any[] = Array.isArray(json) ? json : (json.posts || json.history || json.data || []);
      if (!items.length) break;
      let added = 0;
      for (const it of items) {
        const ids = collectPostIds(it);
        const id = ids[0] || it.refId || JSON.stringify(it).slice(0, 64);
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        all.push(it);
        added++;
      }
      nextCursor = json?.meta?.pagination?.next || json?.next || json?.nextToken || json?.next_token || json?.pageToken || null;
      const hasMore = Boolean(json?.meta?.pagination?.hasMore || nextCursor);
      if (!hasMore && added === 0) break;
      if (!hasMore) break;
      if (all.length >= lastRecords) break;
    }

    const posts = all.slice(0, lastRecords).map((it: any) => {
      const ids = collectPostIds(it);
      const primaryId = ids[0] || null;
      return {
        id: primaryId,
        fb_post_id: primaryId,
        post_ids: ids,
        text: it.post || it.message || it.text || it.caption || it.description || "",
        created_at: firstValidDate(
          it.created, it.createdAt, it.created_time, it.createdTime,
          it.publishedAt, it.published_at, it.scheduleDate, it.scheduledFor,
          it.lastUpdated, it.updated, it.updatedAt, it.timestamp,
          it.platforms?.facebook?.created, it.platforms?.facebook?.createdTime,
          it.platforms?.facebook?.publishedAt, it.platforms?.facebook?.created_time,
        ),
        status: it.status || it.statusType || it.platforms?.facebook?.status || null,
        url: it.postUrl || it.permalink_url || it.platforms?.facebook?.postUrl || null,
        media: collectMediaUrls(it),
        like_count: reactionTotal(it.reactions) ?? pickNumber(it.likeCount, it.likes, it.reactionsCount, it.reactionsByType),
        comment_count: pickNumber(it.commentsCount, it.commentCount, it.comments, it.totalFirstLevelComments),
        share_count: pickNumber(it.shareCount, it.shares, it.sharesCount),
        view_count: pickNumber(it.impressionsUnique, it.impressionCount, it.impressions, it.videoViews, it.viewCount),
        _raw_keys: Object.keys(it || {}),
      };
    });

    return new Response(
      JSON.stringify({ ok: true, count: posts.length, posts, raw_status: lastStatus, raw_error: lastError }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

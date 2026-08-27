// Fetch Facebook Page posts directly via the Meta Graph API (using the
// workspace's connected Page token) and persist every native Page post into
// campaign_logs. campaign_logs is the permanent source of truth for the feed.
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveMetaPage } from "../_shared/metaPage.ts";
import { resolveCaller } from "../_shared/fbPersonal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// No default owner: a missing user_id must NOT resolve to another tenant.
const MIN_SAFE_PURGE_POSTS = 50;

const asText = (
  value: unknown,
) => (typeof value === "string" ? value.trim() : "");

const coerceDateValue = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const nested = coerceDateValue(
      obj.utc ?? obj.iso ?? obj.date ?? obj.created_time ?? obj.createdAt,
    );
    if (nested) return nested;
    const seconds = typeof obj._seconds === "number"
      ? obj._seconds
      : typeof obj.seconds === "number"
      ? obj.seconds
      : null;
    if (seconds !== null) {
      const d = new Date(seconds * 1000);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return null;
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const firstValidDate = (...values: unknown[]): string | null => {
  for (const value of values) {
    const parsed = coerceDateValue(value);
    if (parsed) return parsed;
  }
  return null;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRenderableMediaUrl = (value: unknown): value is string => {
  const url = asText(value);
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const facebookPagePaths = ["/photo.php", "/permalink.php", "/share/", "/posts/", "/videos/", "/watch"];
    if ((host === "facebook.com" || host.endsWith(".facebook.com")) && facebookPagePaths.some((p) => path.startsWith(p))) {
      return false;
    }
    return /\.(jpg|jpeg|png|webp|gif|avif|mp4|mov|m4v)(\?|$)/i.test(url) ||
      host.includes("fbcdn.net") ||
      host.includes("cdninstagram.com");
  } catch (_err) {
    return false;
  }
};

const mediaDedupeKey = (url: string): string => {
  try {
    const u = new URL(url);
    const filename = u.pathname.split('/').pop() || u.pathname;
    return filename.toLowerCase();
  } catch {
    return String(url).split('?')[0].toLowerCase();
  }
};

const normalizeMediaUrls = (value: unknown): string[] => {
  const input = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    if (!isRenderableMediaUrl(item)) continue;
    const text = asText(item);
    const key = mediaDedupeKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
};

const mergeMediaUrls = (...values: unknown[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    for (const url of normalizeMediaUrls(value)) {
      const key = mediaDedupeKey(url);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(url);
    }
  }
  return out;
};

const protectExistingGallery = (existing: unknown, incoming: unknown): string[] => {
  const existingUrls = normalizeMediaUrls(existing);
  const incomingUrls = normalizeMediaUrls(incoming);
  if (incomingUrls.length === 0) return existingUrls;
  if (existingUrls.length > 1 && incomingUrls.length <= 1) return existingUrls;
  return incomingUrls.length >= existingUrls.length ? incomingUrls : existingUrls;
};

const addUrl = (set: Set<string>, value: unknown) => {
  if (isRenderableMediaUrl(value)) set.add(asText(value));
};

const collectMediaUrls = (it: any): string[] => {
  const urls = new Set<string>();
  addUrl(urls, it?.fullPicture);
  addUrl(urls, it?.full_picture);
  addUrl(urls, it?.picture);
  addUrl(urls, it?.imageUrl);
  addUrl(urls, it?.thumbnailUrl);
  addUrl(urls, it?.coverImageUrl);
  addUrl(urls, it?.mediaUrl);
  addUrl(urls, it?.source);

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
    addUrl(urls, node.src);
    addUrl(urls, node.url);
    addUrl(urls, node.href);
    addUrl(urls, node.thumbnailUrl);
    addUrl(urls, node.fullPicture);
    addUrl(urls, node.coverImageUrl);
    addUrl(urls, node.media?.image?.src);
    addUrl(urls, node.media?.source);
    addUrl(urls, node.image?.src);
    addUrl(urls, node.full_picture);
    addUrl(urls, node.permalink_url);
    visitMedia(node.data);
    visitMedia(node.attachments);
    visitMedia(node.subattachments);
  };

  visitMedia(it?.mediaUrls);
  visitMedia(it?.media);
  visitMedia(it?.attachments);
  visitMedia(it?.subattachments);
  visitMedia(it?.attachments?.data);
  return Array.from(urls);
};

const collectPostIds = (it: any, includeDirectId = true): string[] => {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    const v = asText(value);
    if (v) ids.add(v);
  };
  if (includeDirectId) add(it?.id);
  add(it?.fbId);
  add(it?.postId);
  add(it?.post_id);
  add(it?.platforms?.facebook?.id);
  add(it?.postIds?.facebook);
  const postIds = Array.isArray(it?.postIds) ? it.postIds : [];
  for (const p of postIds) {
    const platform = asText(p?.platform).toLowerCase();
    if (!platform || platform === "facebook") {
      add(p?.id ?? p?.postId ?? p?.post_id);
    }
  }
  return Array.from(ids);
};

const looksLikeNativeFacebookPostId = (value: unknown) => {
  const v = asText(value);
  // Native Facebook page posts commonly arrive as PAGEID_POSTID. Keep this
  // broad enough for Meta variants while excluding non-numeric history ids.
  return /^\d{5,}(_\d{5,})?$/.test(v);
};

const pickNativeFacebookPostId = (it: any): string | null => {
  const candidates: unknown[] = [
    it?.fbId,
    it?.postId,
    it?.post_id,
    it?.platforms?.facebook?.id,
    it?.postIds?.facebook,
  ];
  const postIds = Array.isArray(it?.postIds) ? it.postIds : [];
  for (const p of postIds) {
    const platform = asText(p?.platform).toLowerCase();
    if (!platform || platform === "facebook") {
      candidates.push(p?.id ?? p?.postId ?? p?.post_id);
    }
  }
  for (const c of candidates) {
    const v = asText(c);
    if (looksLikeNativeFacebookPostId(v)) return v;
  }
  for (const c of candidates) {
    const v = asText(c);
    if (v) return v;
  }
  return null;
};

type RawPost = {
  item: any;
  source: "platform" | "generic" | "graph";
  profileKey?: string;
  refId?: string | null;
  fbId?: string | null;
  fbName?: string | null;
};
type ProfileCandidate = {
  profileKey: string;
  refId: string | null;
  fbId: string | null;
  fbName: string | null;
  label: string;
};

const pickNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.trunc(value));
    }
    if (
      typeof value === "string" && value.trim() && !Number.isNaN(Number(value))
    ) {
      return Math.max(0, Math.trunc(Number(value)));
    }
  }
  return null;
};

const reactionTotal = (value: any): number | null => {
  if (value == null) return null;
  if (typeof value === "number") return Math.max(0, Math.trunc(value));
  if (
    typeof value === "string" && value.trim() && !Number.isNaN(Number(value))
  ) return Math.max(0, Math.trunc(Number(value)));
  if (Array.isArray(value)) {
    const total = value.reduce(
      (sum, item) =>
        sum + (pickNumber(item?.count, item?.total, item?.value, item) ?? 0),
      0,
    );
    return total > 0 ? total : null;
  }
  if (typeof value === "object") {
    const direct = pickNumber(
      value.total,
      value.total_count,
      value.count,
      value.summary?.total_count,
    );
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

const normalizePost = (raw: RawPost) => {
  const it = raw.item;
  if (String(it?.status || "").toLowerCase() === "error") return null;
  if (Array.isArray(it?.errors) && it.errors.length > 0) return null;

  const nativeId = pickNativeFacebookPostId(it);
  const ids = Array.from(
    new Set(
      [nativeId, ...collectPostIds(it, raw.source === "platform")].filter(
        Boolean,
      ) as string[],
    ),
  );
  const primaryId = nativeId || ids[0] || null;
  if (!primaryId) return null;
  const text = String(
    it.post || it.message || it.story || it.text || it.caption ||
      it.description || "",
  );
  const createdAt = firstValidDate(
    it.created,
    it.createdAt,
    it.created_time,
    it.createdTime,
    it.publishedAt,
    it.published_at,
    it.scheduleDate,
    it.scheduledFor,
    it.lastUpdated,
    it.updated,
    it.updatedAt,
    it.timestamp,
    it.platforms?.facebook?.created,
    it.platforms?.facebook?.createdTime,
    it.platforms?.facebook?.publishedAt,
    it.platforms?.facebook?.created_time,
  ) ?? new Date().toISOString();
  const media = collectMediaUrls(it);
  const url = it.postUrl || it.permalink_url ||
    it.platforms?.facebook?.postUrl || null;
  return {
    id: primaryId,
    fb_post_id: primaryId,
    post_ids: ids,
    text,
    created_at: createdAt,
    status: it.status || it.statusType || it.platforms?.facebook?.status ||
      null,
    url,
    media,
    like_count: reactionTotal(it.reactions) ??
      pickNumber(
        it.likeCount,
        it.likes?.summary?.total_count,
        it.likes,
        it.reactionsCount,
        it.reactionsByType,
      ),
    comment_count: pickNumber(
      it.commentsCount,
      it.commentCount,
      it.comments?.summary?.total_count,
      it.comments,
      it.totalFirstLevelComments,
    ),
    share_count: pickNumber(
      it.shareCount,
      it.shares?.count,
      it.shares,
      it.sharesCount,
    ),
    view_count: pickNumber(
      it.impressionsUnique,
      it.impressionCount,
      it.impressions,
      it.videoViews,
      it.viewCount,
    ),
    _profile_key: raw.profileKey ?? null,
    _profile_ref_id: raw.refId ?? null,
    _profile_fb_id: raw.fbId ?? null,
    _profile_fb_name: raw.fbName ?? null,
    _raw_keys: Object.keys(it || {}),
    _raw: it,
  };
};

const titleFromText = (text: string) =>
  (text.trim().split("\n")[0] || "פוסט פייסבוק").slice(0, 120);

const parseMetaCredential = (
  raw: unknown,
): { token: string; pageId: string | null } => {
  const s = asText(raw);
  if (!s) return { token: "", pageId: null };
  try {
    const parsed = JSON.parse(s);
    return {
      token: asText(parsed?.page_access_token) || asText(parsed?.access_token),
      pageId: asText(parsed?.page_id) || asText(parsed?.facebook_page_id) ||
        null,
    };
  } catch {
    return { token: s, pageId: null };
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    let body: any = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }
    const lastRecords = Math.min(
      500,
      Math.max(
        1,
        Number(
          body?.lastRecords ?? url.searchParams.get("lastRecords") ?? "500",
        ),
      ),
    );
    // Keep our request at a pagination-friendly size, capped by Graph limits.
    // pagination-friendly size so maxPages is high enough to walk history.
    const pageSize = Math.min(
      50,
      Math.max(
        10,
        Number(body?.pageSize ?? url.searchParams.get("pageSize") ?? 50),
      ),
    );
    const maxPages = Math.max(1, Math.ceil(lastRecords / pageSize));
    const dataType = asText(body?.dataType ?? url.searchParams.get("dataType")) ||
      "posts";
    const skipAnalytics = body?.skipAnalytics === true ||
      url.searchParams.get("skipAnalytics") === "true";
    const purge = body?.purge === true || url.searchParams.get("purge") === "true";
    const syncComments = body?.sync_comments === true ||
      url.searchParams.get("sync_comments") === "true";
    const since = asText(body?.since ?? url.searchParams.get("since"));
    const until = asText(body?.until ?? url.searchParams.get("until"));
    const persist = body?.persist !== false &&
      url.searchParams.get("persist") !== "false";
    const requestedOwnerId = asText(
      body?.user_id ?? body?.owner_id ?? url.searchParams.get("user_id"),
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const caller = await resolveCaller(admin, req);
    if (!caller) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized", posts: [], count: 0 }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ownerId = caller.workspaceOwnerId;
    if (requestedOwnerId && requestedOwnerId !== ownerId) {
      return new Response(JSON.stringify({ ok: false, error: "workspace_forbidden", posts: [], count: 0 }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const page = await resolveMetaPage(admin, ownerId);
    const ws = { facebook_page_id: page?.pageId ?? null, facebook_page_name: page?.pageName ?? null };
    const profileKey: string | null = null;

    const resolveGraphCredential = async (): Promise<
      { token: string; pageId: string | null; source: string | null }
    > => {
      if (page?.token) return { token: page.token, pageId: page.pageId, source: "messenger_page_bindings" };
      return { token: "", pageId: null, source: null };
    };

    const fetchGraphHistory = async (): Promise<
      { posts: RawPost[]; status: number; error: any; source: string | null }
    > => {
      const cred = await resolveGraphCredential();
      if (!cred.token || !cred.pageId) {
        return {
          posts: [],
          status: 0,
          error: "facebook_page_access_token_missing",
          source: cred.source,
        };
      }
      const fields = [
        "id",
        "message",
        "story",
        "created_time",
        "full_picture",
        "permalink_url",
        "attachments{media,url,type,subattachments{media,url,type}}",
        "likes.summary(true).limit(0)",
        "comments.summary(true).limit(0)",
        "shares",
      ].join(",");
      // Import window: everything from 2026-07-27 onward unless the caller
      // asked for a different `since`. Keeps the feed complete + fast.
      const sinceParam = since || "2026-07-27";
      const untilParam = until || "";
      // `/posts` only returns posts authored by the Page itself and silently
      // hides native/other-authored items. Walk BOTH edges and merge so a full
      // import really means every recent post on the Page.
      const edges = ["published_posts", "feed", "posts"];
      const buildUrl = (edge: string) => `${
        new URL(`${cred.pageId}/${edge}`, "https://graph.facebook.com/v26.0/")
          .toString()
      }?${
        new URLSearchParams({
          fields,
          limit: String(Math.min(100, Math.max(10, pageSize))),
          since: sinceParam,
          ...(untilParam ? { until: untilParam } : {}),
          access_token: cred.token,
        }).toString()
      }`;

      const rows: RawPost[] = [];
      const seen = new Set<string>();
      let status = 0;
      let error: any = null;
      let edgeIndex = 0;
      let nextUrl = buildUrl(edges[0]);
      for (
        let page2 = 0;
        page2 < maxPages * edges.length && nextUrl && rows.length < lastRecords;
        page2++
      ) {
        const resp = await fetch(nextUrl);
        status = resp.status;
        const json = await resp.json().catch(() => ({} as any));
        if (!resp.ok) {
          error = json?.error ?? json;
          break;
        }
        const items: any[] = Array.isArray(json?.data) ? json.data : [];
        if (!items.length) {
          // Move on to the next edge instead of ending the whole import.
          edgeIndex += 1;
          if (edgeIndex >= edges.length) break;
          nextUrl = buildUrl(edges[edgeIndex]);
          continue;
        }
        for (const it of items) {
          const id = asText(it?.id);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          rows.push({
            item: {
              ...it,
              post: it.message ?? it.story ?? "",
              fbId: id,
              postId: id,
              created: it.created_time,
              postUrl: it.permalink_url,
            },
            source: "graph",
            profileKey: undefined,
            refId: null,
            fbId: cred.pageId,
            fbName: ws?.facebook_page_name ?? null,
          });
        }
        const paging = typeof json?.paging?.next === "string" ? json.paging.next : "";
        if (paging) {
          nextUrl = paging;
        } else {
          edgeIndex += 1;
          nextUrl = edgeIndex < edges.length ? buildUrl(edges[edgeIndex]) : "";
        }
      }
      if (error && rows.length > 0) {
        // A failing secondary edge must not void the posts we did fetch.
        error = null;
      }
      return { posts: rows, status, error, source: cred.source };
    };

    const allById = new Map<string, RawPost>();
    const diagnostics: any[] = [];
    let lastStatus = 0;
    let lastError: any = null;
    const providerBlocked = false;
    const mergePosts = (posts: RawPost[]) => {
      for (const post of posts) {
        const id = pickNativeFacebookPostId(post.item) ||
          collectPostIds(post.item, true)[0] ||
          JSON.stringify(post.item).slice(0, 96);
        allById.set(id, post);
      }
    };

    let graphSource: string | null = null;
    {
      const graphResult = await fetchGraphHistory();
      diagnostics.push({ source: "graph", profile: graphResult.source, status: graphResult.status, count: graphResult.posts.length, error: graphResult.error });
      graphSource = graphResult.source;
      lastStatus = graphResult.status || lastStatus;
      lastError = graphResult.error ?? lastError;
      mergePosts(graphResult.posts);
    }


    const all = Array.from(allById.values());
    const normalized = all.map(normalizePost).filter((
      p,
    ): p is NonNullable<ReturnType<typeof normalizePost>> => !!p);
    const byNativeId = new Map<
      string,
      NonNullable<ReturnType<typeof normalizePost>>
    >();
    for (const p of normalized) {
      const existing = byNativeId.get(p.fb_post_id);
      if (!existing || (!existing.media.length && p.media.length)) {
        byNativeId.set(p.fb_post_id, p);
      }
    }
    const posts = Array.from(byNativeId.values()).slice(0, lastRecords);

    let upserted = 0;
    let persistError: string | null = null;
    let purgeApplied = false;
    let purgeSkippedReason: string | null = null;
    if (persist && posts.length > 0) {
      if (purge) {
        if (posts.length >= MIN_SAFE_PURGE_POSTS) {
          await admin
            .from("engagement_events")
            .delete()
            .eq("user_id", ownerId)
            .eq("platform", "facebook");
          await admin
            .from("campaign_logs")
            .delete()
            .eq("user_id", ownerId)
            .eq("channel", "facebook");
          purgeApplied = true;
        } else {
          purgeSkippedReason = `provider_returned_too_few_posts:${posts.length}/${MIN_SAFE_PURGE_POSTS}`;
        }
      }
      // Sync integrity: never let a fresh provider payload that arrived without
      // media wipe out media we already resolved (Graph enrichment, og:image
      // scrape, or a permanently mirrored copy in post-media-cache).
      const incomingIds = posts.map((p) => String(p.fb_post_id)).filter(Boolean);
      const existingById = new Map<string, any>();
      for (let i = 0; i < incomingIds.length; i += 200) {
        const { data: prior } = await admin
          .from("campaign_logs")
          .select("provider_message_id, media_urls, provider_response")
          .eq("user_id", ownerId)
          .in("provider_message_id", incomingIds.slice(i, i + 200));
        (prior ?? []).forEach((row: any) => existingById.set(String(row.provider_message_id), row));
      }

      const rows = posts
        .filter((p) => p.fb_post_id)
        .map((p) => {
          const prior = existingById.get(String(p.fb_post_id));
          const priorPr = (prior?.provider_response as any) ?? {};
          const priorCached = normalizeMediaUrls(priorPr.cached_media_urls);
          const priorMedia = mergeMediaUrls(
            prior?.media_urls,
            priorPr.media_urls,
            priorPr.raw?.mediaUrls,
            priorPr.raw?.fullPicture ? [priorPr.raw.fullPicture] : [],
          );
          const incomingMedia = normalizeMediaUrls(p.media);
          const media = protectExistingGallery(priorMedia, incomingMedia);
          const durableMedia = protectExistingGallery(priorCached.length > 0 ? priorCached : priorMedia, mergeMediaUrls(priorCached, media));

          return {
            user_id: ownerId,
            campaign_name: titleFromText(p.text),
            channel: "facebook",
            message_body: p.text || titleFromText(p.text),
            created_at: p.created_at,
            sent_at: p.created_at,
            status: "sent",
            is_archived: false,
            provider_message_id: String(p.fb_post_id),
            // Persist media on the durable column too, so the feed no longer
            // depends on digging through provider_response.
            media_urls: durableMedia,
            provider_response: {
              imported_native_facebook: true,
              imported_at: new Date().toISOString(),
              profile_ref_id: p._profile_ref_id,
              facebook_page_id: p._profile_fb_id ?? ws?.facebook_page_id ?? null,
              facebook_page_name: p._profile_fb_name ?? ws?.facebook_page_name ??
                null,
              postIds: p.post_ids.map((id: string) => ({
                platform: "facebook",
                id,
                postUrl: p.url || null,
              })),
              media_urls: media,
              ...(priorCached.length > 0 ? { cached_media_urls: priorCached } : {}),
              external_url: p.url || priorPr.external_url || null,
              native_status: p.status,
              raw_keys: p._raw_keys,
              raw: p._raw,
            },
            like_count: p.like_count ?? 0,
            comment_count: p.comment_count ?? 0,
            share_count: p.share_count ?? 0,
            view_count: p.view_count ?? 0,
            metrics_updated_at: new Date().toISOString(),
          };
        });

      if (rows.length > 0) {
        const { data, error } = await admin
          .from("campaign_logs")
          .upsert(rows, { onConflict: "user_id,provider_message_id" })
          .select("id");
        if (error) persistError = error.message;
        else upserted = data?.length ?? rows.length;
      }
    }

    let commentSyncQueued = false;
    if (persist && syncComments && posts.length > 0) {
      const postIds = posts.map((p) => p.fb_post_id).filter(Boolean);
      const syncTask = (async () => {
        for (let i = 0; i < postIds.length; i += 2) {
          const chunk = postIds.slice(i, i + 2);
          try {
            await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/meta-comments-sync`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                action: "sync",
                user_id: ownerId,
                post_ids: chunk,
              }),
            }).catch(() => null);
          } catch (_commentErr) {
            // Keep processing subsequent chunks.
          }
          await delay(7_000);
        }
      })();
      const edgeRuntime = (globalThis as any).EdgeRuntime;
      if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(syncTask);
      else await syncTask;
      commentSyncQueued = true;
    }

    // Full Graph enrichment: for every stored native FB post, batch-fetch
    // full_picture + attachments (thumbnails), live engagement counters
    // (reactions/comments/shares) AND the true native created_time. This
    // guarantees UI cards show the real photo, real counters, and the
    // original publish date — never the import moment or a zero counter.
    let enrichedMedia = 0;
    let enrichedCounters = 0;
    let enrichedDates = 0;
    try {
      const cred = await resolveGraphCredential();
      if (cred.token) {
        const { data: allFbPosts } = await admin
          .from("campaign_logs")
          .select("id, provider_message_id, provider_response, media_urls, created_at, like_count, comment_count, share_count, view_count")
          .eq("channel", "facebook")
          .eq("user_id", ownerId)
          .eq("is_archived", false)
          .not("provider_message_id", "is", null)
          .limit(500);
        const targets = (allFbPosts || []).filter((r: any) =>
          /^\d{5,}(_\d{5,})?$/.test(String(r.provider_message_id || ""))
        );
        const graphFields =
          "full_picture,attachments{media,subattachments{media}},reactions.summary(true).limit(0),likes.summary(true).limit(0),comments.summary(true).limit(0),shares,created_time,insights.metric(post_impressions_unique,post_impressions)";
        for (let i = 0; i < targets.length; i += 40) {
          const chunk = targets.slice(i, i + 40);
          const ids = chunk.map((t: any) => String(t.provider_message_id)).join(",");
          const url = `https://graph.facebook.com/v26.0/?ids=${encodeURIComponent(ids)}&fields=${encodeURIComponent(graphFields)}&access_token=${encodeURIComponent(cred.token)}`;
          const resp = await fetch(url);
          if (!resp.ok) continue;
          const json: any = await resp.json().catch(() => ({}));
          for (const t of chunk) {
            const pid = String(t.provider_message_id);
            const entry = json?.[pid];
            if (!entry) continue;

            // Media URLs
            const urls: string[] = [];
            const push = (u: any) => { if (isRenderableMediaUrl(u) && !urls.includes(u)) urls.push(u.trim()); };
            push(entry.full_picture);
            const visit = (node: any) => {
              if (!node) return;
              if (Array.isArray(node)) { node.forEach(visit); return; }
              push(node?.media?.image?.src);
              push(node?.media?.source);
              if (node.subattachments?.data) visit(node.subattachments.data);
            };
            if (entry.attachments?.data) visit(entry.attachments.data);

            // Live engagement counters
            const likeCount = pickNumber(
              entry?.reactions?.summary?.total_count,
              entry?.likes?.summary?.total_count,
            );
            const commentCount = pickNumber(entry?.comments?.summary?.total_count);
            const shareCount = pickNumber(entry?.shares?.count);
            // Live "views" straight from Page post insights (no aggregator).
            const insightRows: any[] = Array.isArray(entry?.insights?.data) ? entry.insights.data : [];
            const insightValue = (metric: string): number | null => {
              const row = insightRows.find((r) => String(r?.name || "") === metric);
              const raw = Array.isArray(row?.values) ? row.values[0]?.value : null;
              return pickNumber(raw);
            };
            const viewCount = insightValue("post_impressions_unique") ?? insightValue("post_impressions");

            // True native created_time
            const nativeCreatedAt = firstValidDate(entry?.created_time);

            const existingMedia = mergeMediaUrls(
              (t as any).media_urls,
              (t as any).provider_response?.cached_media_urls,
              (t as any).provider_response?.media_urls,
            );
            const cachedMedia = normalizeMediaUrls((t as any).provider_response?.cached_media_urls);
            const mergedMedia = protectExistingGallery(existingMedia, urls);
            const durableMedia = protectExistingGallery(existingMedia, mergeMediaUrls(cachedMedia, mergedMedia));

            const updatePayload: Record<string, unknown> = {
              // Keep the durable column in sync; never downgrade to an empty list.
              media_urls: durableMedia,
              provider_response: {
                ...((t as any).provider_response || {}),
                media_urls: mergedMedia,
                graph_enriched_at: new Date().toISOString(),
                native_created_time: entry?.created_time ?? null,
              },
            };
            if (urls.length > 0) { enrichedMedia++; }
            if (likeCount !== null) updatePayload.like_count = likeCount;
            if (commentCount !== null) updatePayload.comment_count = commentCount;
            if (shareCount !== null) updatePayload.share_count = shareCount;
            if (viewCount !== null) updatePayload.view_count = viewCount;
            if (likeCount !== null || commentCount !== null || shareCount !== null || viewCount !== null) {
              updatePayload.metrics_updated_at = new Date().toISOString();
              enrichedCounters++;
            }
            if (nativeCreatedAt) {
              updatePayload.created_at = nativeCreatedAt;
              updatePayload.sent_at = nativeCreatedAt;
              enrichedDates++;
            }

            await admin.from("campaign_logs").update(updatePayload).eq("id", (t as any).id);
          }
        }
      }
    } catch (enrichErr) {
      console.warn("[fb-recent-posts] graph enrichment failed", enrichErr);
    }



    return new Response(
      JSON.stringify({
        ok: true,
        count: posts.length,
        posts,
        persisted: persist,
        upserted,
        enriched_media: enrichedMedia,
        enriched_counters: enrichedCounters,
        enriched_dates: enrichedDates,
        comment_sync_queued: commentSyncQueued,
        purged: purgeApplied,
        purge_requested: purge && persist,
        purge_skipped_reason: purgeSkippedReason,
        persist_error: persistError,

        owner_id: ownerId,
        raw_status: lastStatus,
        raw_error: lastError,
        graph_source: graphSource,
        diagnostics,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

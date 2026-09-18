// Fetch Facebook Page posts directly via the Meta Graph API (using the
// workspace's connected Page token) and persist every native Page post into
// campaign_logs. campaign_logs is the permanent source of truth for the feed.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { isMetaPermissionError, resolveMetaPage, resolveMetaPageCandidates } from "../_shared/metaPage.ts";
import { resolveCaller } from "../_shared/fbPersonal.ts";
import { describeMetaError } from "../_shared/metaErrorDetail.ts";

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

/**
 * A Page credential together with the DB row it came from, so any failure can
 * be traced back to the exact messenger_page_bindings record in use.
 */
type GraphCred = {
  token: string;
  pageId: string | null;
  source: string | null;
  recordId?: string | null;
  updatedAt?: string | null;
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
      100,
      Math.max(
        10,
        Number(body?.pageSize ?? url.searchParams.get("pageSize") ?? 50),
      ),
    );
    // Always allow enough page walks to reach `lastRecords` even if Graph
    // returns short batches (it often does when it filters hidden items).
    const maxPages = Math.max(4, Math.ceil((lastRecords / pageSize) * 2));
    const dataType = asText(body?.dataType ?? url.searchParams.get("dataType")) ||
      "posts";
    const skipAnalytics = body?.skipAnalytics === true ||
      url.searchParams.get("skipAnalytics") === "true";
    const manualRefresh = body?.manual_refresh === true ||
      url.searchParams.get("manual_refresh") === "true";
    const purge = body?.purge === true || url.searchParams.get("purge") === "true";
    // Reconciliation: remove native-imported posts from OUR feed when they no
    // longer exist on the Facebook Page (deleted natively on Facebook).
    const pruneMissing = body?.prune_missing === true ||
      url.searchParams.get("prune_missing") === "true";
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
    // The browser may legitimately ask for a workspace other than the one
    // stamped on the profile (the client persists its own active workspace).
    // Accept any workspace the caller is actually a member of instead of
    // hard-failing with 403 on a stale profile pointer.
    let ownerId = caller.workspaceOwnerId;
    if (requestedOwnerId && requestedOwnerId !== ownerId) {
      let allowed = requestedOwnerId === caller.userId;
      if (!allowed) {
        const { data: membership } = await admin
          .from("workspace_memberships")
          .select("workspace_owner_id")
          .eq("user_id", caller.userId)
          .eq("workspace_owner_id", requestedOwnerId)
          .maybeSingle();
        allowed = !!membership;
      }
      if (allowed) {
        ownerId = requestedOwnerId;
      } else {
        // Stale/foreign workspace pointer coming from the browser cache: fall
        // back to the caller's own workspace instead of blanking the page.
        console.warn("[fb-recent-posts] ignoring non-member workspace request", {
          caller: caller.userId,
          requested: requestedOwnerId,
        });
      }
    }



    const page = await resolveMetaPage(admin, ownerId);
    const ws = { facebook_page_id: page?.pageId ?? null, facebook_page_name: page?.pageName ?? null };
    const profileKey: string | null = null;

    const resolveGraphCredential = async (): Promise<GraphCred> => {
      if (page?.token) {
        return {
          token: page.token,
          pageId: page.pageId,
          source: "messenger_page_bindings",
          recordId: page.recordId ?? null,
          updatedAt: page.updatedAt ?? null,
        };
      }
      return { token: "", pageId: null, source: null, recordId: null, updatedAt: null };
    };

    /**
     * Self-healing Page token: when the stored Page token is rejected for
     * missing read scopes, mint a fresh Page token from the workspace's
     * personal Facebook login (/me/accounts). The user-login token normally
     * carries the freshly granted `pages_read_engagement`, so the refresh
     * fixes the read WITHOUT sending the user through another OAuth round.
     */
    const refreshPageTokenFromPersonal = async (): Promise<GraphCred | null> => {
      const wantedPageId = page?.pageId ?? null;
      if (!wantedPageId) return null;
      const { data: personal } = await admin
        .from("fb_personal_connections")
        .select("access_token")
        .eq("workspace_owner_id", ownerId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const userToken = asText((personal as any)?.access_token);
      if (!userToken) return null;
      try {
        const resp = await fetch(
          `https://graph.facebook.com/v26.0/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(userToken)}`,
        );
        const json: any = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          console.warn("[fb-recent-posts] page token refresh failed", {
            http_status: resp.status,
            message: json?.error?.message ?? null,
          });
          return null;
        }
        const match = (Array.isArray(json?.data) ? json.data : []).find(
          (row: any) => String(row?.id ?? "") === String(wantedPageId),
        );
        const fresh = asText(match?.access_token);
        if (!fresh || fresh === page?.token) return null;
        const { data: saved } = await admin
          .from("messenger_page_bindings")
          .upsert(
            {
              owner_id: ownerId,
              page_id: String(wantedPageId),
              page_name: asText(match?.name) || page?.pageName || null,
              page_access_token: fresh,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "owner_id,page_id" },
          )
          .select("id, updated_at")
          .maybeSingle();
        console.log("[fb-recent-posts] refreshed page access token from personal login", {
          page_id: wantedPageId,
          binding_record_id: (saved as any)?.id ?? null,
          binding_updated_at: (saved as any)?.updated_at ?? null,
        });
        return {
          token: fresh,
          pageId: String(wantedPageId),
          source: "refreshed_from_personal",
          recordId: (saved as any)?.id ?? null,
          updatedAt: (saved as any)?.updated_at ?? null,
        };
      } catch (e) {
        console.warn("[fb-recent-posts] page token refresh threw", e instanceof Error ? e.message : e);
        return null;
      }
    };

    /**
     * Guarantees the token we read posts with is a PAGE access token for the
     * exact page_id we query (a user-level token silently fails the
     * /{page-id}/published_posts read). `/me` resolved with a Page token
     * returns the Page node, so id === page_id proves the token type.
     */
    const verifyPageToken = async (cred: GraphCred): Promise<boolean> => {
      if (!cred.token || !cred.pageId) return false;
      try {
        const resp = await fetch(
          `https://graph.facebook.com/v26.0/me?fields=id,name&access_token=${encodeURIComponent(cred.token)}`,
        );
        const payload: any = await resp.json().catch(() => ({}));
        const tokenNodeId = String(payload?.id ?? "");
        const isPageToken = resp.ok && tokenNodeId === String(cred.pageId);
        if (!isPageToken) {
          console.error("[fb-recent-posts] stored token is not a Page access token", {
            page_id: cred.pageId,
            token_source: cred.source,
            binding_record_id: cred.recordId ?? null,
            token_node_id: tokenNodeId || null,
            http_status: resp.status,
            message: payload?.error?.message ?? null,
          });
        }
        return isPageToken;
      } catch (e) {
        console.warn("[fb-recent-posts] page token verification threw", e instanceof Error ? e.message : e);
        // Network hiccup: don't block the read on the probe.
        return true;
      }
    };

    /**
     * Logs the REAL scopes/type of the token that Graph just rejected.
     *
     * `/{page-id}/permissions` does not exist (Meta answers "#100 nonexisting
     * field"), so the only reliable inspection is `debug_token` with an app
     * access token: it returns `type`, `scopes`, `expires_at` and
     * `granular_scopes` for any token, Page or user.
     */
    const logTokenScopes = async (cred: GraphCred) => {
      try {
        const appId = Deno.env.get("META_APP_ID") || "2885631568443536";
        const appSecret = Deno.env.get("META_APP_SECRET") || "";
        if (!appSecret) {
          console.error("[fb-recent-posts] cannot inspect token: META_APP_SECRET missing");
          return;
        }
        const res = await fetch(
          `https://graph.facebook.com/v26.0/debug_token?input_token=${
            encodeURIComponent(cred.token)
          }&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
        );
        const body = await res.text().catch(() => "");
        let parsed: any = {};
        try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = {}; }
        const info = parsed?.data ?? {};
        const scopes: string[] = Array.isArray(info?.scopes) ? info.scopes : [];
        console.error("[fb-recent-posts] token inspection at failure", {
          page_id: cred.pageId,
          token_source: cred.source,
          binding_record_id: cred.recordId ?? null,
          binding_updated_at: cred.updatedAt ?? null,
          token_type: info?.type ?? null,
          token_profile_id: info?.profile_id ?? info?.user_id ?? null,
          token_app_id: info?.app_id ?? null,
          token_is_valid: info?.is_valid ?? null,
          scopes,
          has_pages_read_engagement: scopes.includes("pages_read_engagement"),
          has_pages_show_list: scopes.includes("pages_show_list"),
          granular_scopes: info?.granular_scopes ?? null,
          http_status: res.status,
          raw_body: body.slice(0, 1500),
        });
      } catch (e) {
        console.error("[fb-recent-posts] token inspection failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    };

    const fetchGraphHistoryWith = async (
      cred: GraphCred,
    ): Promise<
      { posts: RawPost[]; status: number; error: any; source: string | null }
    > => {
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
      // Import window: default to the last 365 days so a manual refresh really
      // pulls the whole recent history of the Page, not a fixed cut-off date.
      const sinceParam = since ||
        new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const untilParam = until || "";
      // `/posts` only returns posts authored by the Page itself and silently
      // hides native/other-authored items. Walk BOTH edges and merge so a full
      // import really means every recent post on the Page.
      const edges = ["published_posts", "feed", "posts"];
      const buildUrl = (edge: string, after?: string | null) => `${
        new URL(`${cred.pageId}/${edge}`, "https://graph.facebook.com/v26.0/")
          .toString()
      }?${
        new URLSearchParams({
          fields,
          limit: String(Math.min(100, Math.max(10, pageSize))),
          since: sinceParam,
          ...(untilParam ? { until: untilParam } : {}),
          ...(after ? { after } : {}),
          access_token: cred.token,
        }).toString()
      }`;

      const rows: RawPost[] = [];
      const seen = new Set<string>();
      const seenCursors = new Set<string>();
      let status = 0;
      let error: any = null;
      let edgeIndex = 0;
      let nextUrl = buildUrl(edges[0]);
      for (
        let page2 = 0;
        page2 < maxPages * edges.length && nextUrl && rows.length < lastRecords;
        page2++
      ) {
        // A transient network failure must never abort the whole import: retry
        // the exact same cursor once before giving up on this edge.
        let resp: Response | null = null;
        let json: any = {};
        for (let attempt = 0; attempt < 2 && !resp; attempt++) {
          try {
            resp = await fetch(nextUrl);
          } catch (netErr) {
            if (attempt === 1) {
              console.error("[fb-recent-posts] graph network error", {
                edge: edges[edgeIndex],
                message: netErr instanceof Error ? netErr.message : String(netErr),
              });
              error = { message: "graph_network_error" };
            } else {
              await new Promise((r) => setTimeout(r, 500));
            }
          }
        }
        if (!resp) break;
        status = resp.status;
        // Keep the raw body: a truncated/parsed-away payload hides the real
        // reason Graph rejected the read.
        const bodyText = await resp.text().catch(() => "");
        try { json = bodyText ? JSON.parse(bodyText) : {}; } catch { json = {}; }
        if (!resp.ok) {
          error = json?.error ?? json;
          // Explicit, actionable logging: a permission/expiry problem must be
          // visible in the function logs instead of silently returning zero.
          console.error("[fb-recent-posts] graph error", {
            edge: edges[edgeIndex],
            request_url: nextUrl.replace(/access_token=[^&]+/, "access_token=REDACTED"),
            page_id: cred.pageId,
            token_source: cred.source,
            // Exact DB row the token came from: makes a mismatch between the
            // Connections tab binding and this fetch provable from the logs.
            binding_record_id: cred.recordId ?? null,
            binding_updated_at: cred.updatedAt ?? null,
            token_tail: cred.token ? cred.token.slice(-6) : null,
            http_status: status,
            code: (error as any)?.code ?? null,
            subcode: (error as any)?.error_subcode ?? null,
            type: (error as any)?.type ?? null,
            message: (error as any)?.message ?? null,
            fbtrace_id: (error as any)?.fbtrace_id ?? null,
            raw_body: bodyText.slice(0, 2000),
          });
          // A permission denial applies to every Page feed edge for this token.
          // Return immediately instead of issuing the same doomed request to
          // /feed and /posts and producing three identical errors.
          if (isMetaPermissionError(error)) {
            await logTokenScopes(cred);
            break;
          }
          // Try the next edge — one blocked edge shouldn't abort the import.
          edgeIndex += 1;
          if (edgeIndex >= edges.length) break;
          nextUrl = buildUrl(edges[edgeIndex]);
          continue;
        }
        const items: any[] = Array.isArray(json?.data) ? json.data : [];
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
        // Walk the history with Graph's own cursor. `paging.next` is the
        // authoritative link; the raw `after` cursor is the fallback. A repeated
        // cursor means this edge is exhausted, so move on instead of looping.
        const after = asText(json?.paging?.cursors?.after);
        const paging = typeof json?.paging?.next === "string" ? json.paging.next : "";
        const cursorKey = after ? `${edges[edgeIndex]}:${after}` : "";
        const cursorRepeated = !!cursorKey && seenCursors.has(cursorKey);
        if (cursorKey) seenCursors.add(cursorKey);
        if (paging && !cursorRepeated) {
          nextUrl = paging;
        } else if (after && !cursorRepeated) {
          nextUrl = buildUrl(edges[edgeIndex], after);
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

    /**
     * Route through the SuperAdmin's central (App-Review approved) Meta app
     * whenever the workspace's own token is rejected with a permission error
     * such as `#10 pages_read_engagement`.
     */
    // The credential that actually worked for the feed read. Reused for the
    // enrichment pass so counters/media never fail with a different token.
    let workingCred: GraphCred | null = null;

    const fetchGraphHistory = async (): Promise<
      { posts: RawPost[]; status: number; error: any; source: string | null; blocked: boolean }
    > => {
      // The manual refresh button must use exactly the same credential set the
      // Connections tab reports as connected — own workspace bindings first,
      // then the platform-shared Page — otherwise a valid connection looks
      // like a permission/connection mismatch failure.
      const candidates = await resolveMetaPageCandidates(admin, ownerId);
      const mapped: GraphCred[] = candidates.map((c) => ({
        token: c.token,
        pageId: c.pageId,
        source: c.scope,
        recordId: c.recordId ?? null,
        updatedAt: c.updatedAt ?? null,
      }));
      // Never read through a stale duplicate: for each Page keep only the most
      // recently written binding row (a reconnect always rewrites updated_at).
      const freshestByPage = new Map<string, GraphCred>();
      for (const cred of mapped) {
        const key = String(cred.pageId ?? "");
        const prev = freshestByPage.get(key);
        const newer = !prev ||
          new Date(cred.updatedAt ?? 0).getTime() > new Date(prev.updatedAt ?? 0).getTime();
        if (newer) freshestByPage.set(key, cred);
      }
      const ordered: GraphCred[] = freshestByPage.size
        ? [...freshestByPage.values()]
        : [await resolveGraphCredential()];
      if (!ordered.some((c) => c.token && c.pageId)) {
        console.error("[fb-recent-posts] no usable Page access token", {
          owner_id: ownerId,
          candidates: ordered.length,
        });
      } else {
        console.log("[fb-recent-posts] using page bindings", {
          owner_id: ownerId,
          bindings: ordered.map((c) => ({
            binding_record_id: c.recordId ?? null,
            page_id: c.pageId,
            updated_at: c.updatedAt ?? null,
          })),
        });
      }
      let last: { posts: RawPost[]; status: number; error: any; source: string | null } = {
        posts: [],
        status: 0,
        error: "facebook_page_access_token_missing",
        source: null,
      };
      for (const rawCred of ordered) {
        // Enforce a real Page access token before hitting /{page-id}/...:
        // if the stored value is a user token, mint the Page token first.
        let cred = rawCred;
        if (!(await verifyPageToken(cred))) {
          const minted = await refreshPageTokenFromPersonal();
          if (minted && minted.pageId === cred.pageId && await verifyPageToken(minted)) {
            cred = minted;
          }
        }
        const res = await fetchGraphHistoryWith(cred);
        if (res.posts.length > 0) {
          workingCred = cred;
          return { ...res, blocked: false };
        }
        last = res;
        if (!isMetaPermissionError(res.error)) break;
      }
      // Last resort before giving up: mint a fresh Page token from the
      // personal login and retry once. This turns the old "reconnect and try
      // again later" workaround into an automatic, immediate recovery.
      if (isMetaPermissionError(last.error)) {
        const refreshed = await refreshPageTokenFromPersonal();
        if (refreshed) {
          const retry = await fetchGraphHistoryWith(refreshed);
          if (retry.posts.length > 0) {
            workingCred = refreshed;
            return { ...retry, blocked: false };
          }
          last = retry;
        }
      }
      return { ...last, blocked: isMetaPermissionError(last.error) };
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

    // Posts scraped by the companion browser extension (DOM fallback) arrive
    // here so a Graph permission block never leaves the user empty-handed.
    const extensionPosts: any[] = Array.isArray(body?.posts) ? body.posts : [];
    let permissionBlocked = false;
    let graphSource: string | null = null;
    if (extensionPosts.length > 0) {
      mergePosts(
        extensionPosts.map((it: any) => ({
          item: {
            ...it,
            post: it.post ?? it.message ?? it.text ?? "",
            fbId: it.fbId ?? it.post_id ?? it.id ?? null,
            postId: it.postId ?? it.post_id ?? it.id ?? null,
            created: it.created ?? it.created_time ?? it.date ?? null,
            postUrl: it.postUrl ?? it.url ?? it.permalink_url ?? null,
          },
          source: "generic" as const,
          refId: null,
          fbId: ws?.facebook_page_id ?? null,
          fbName: ws?.facebook_page_name ?? null,
        })),
      );
      diagnostics.push({ source: "extension", count: extensionPosts.length });
    }
    {
      const graphResult = await fetchGraphHistory();
      permissionBlocked = graphResult.blocked;
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

    // Auto-delete: anything we previously imported from the Page that is no
    // longer returned by Graph inside the same time window was deleted on
    // Facebook — drop it from our feed too. Guarded so an empty/partial
    // provider payload can never wipe the history.
    let prunedMissing = 0;
    if (persist && pruneMissing && posts.length >= 5) {
      const liveIds = new Set(posts.map((p) => String(p.fb_post_id)).filter(Boolean));
      const oldestLive = posts
        .map((p) => new Date(p.created_at ?? Date.now()).getTime())
        .filter((t) => Number.isFinite(t))
        .sort((a, b) => a - b)[0];
      const windowStart = new Date(oldestLive ?? Date.now()).toISOString();
      const { data: mine } = await admin
        .from("campaign_logs")
        .select("id, provider_message_id, provider_response, sent_at")
        .eq("user_id", ownerId)
        .eq("channel", "facebook")
        .eq("status", "sent")
        .gte("sent_at", windowStart)
        .limit(1000);
      const stale = (mine ?? []).filter((row: any) =>
        row?.provider_response?.imported_native_facebook === true &&
        row.provider_message_id &&
        !liveIds.has(String(row.provider_message_id))
      );
      if (stale.length > 0 && stale.length < (mine?.length ?? 0)) {
        const ids = stale.map((r: any) => r.id);
        for (let i = 0; i < ids.length; i += 100) {
          const { error: delErr } = await admin
            .from("campaign_logs")
            .delete()
            .in("id", ids.slice(i, i + 100));
          if (!delErr) prunedMissing += ids.slice(i, i + 100).length;
        }
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

    // Full Graph enrichment: for every stored native FB post, fetch
    // full_picture + attachments (thumbnails), live engagement counters
    // (reactions/comments/shares) AND the true native created_time. This
    // guarantees UI cards show the real photo, real counters, and the
    // original publish date — never the import moment or a zero counter.
    let enrichedMedia = 0;
    let enrichedCounters = 0;
    let enrichedDates = 0;
    try {
      const cred = workingCred ?? await resolveGraphCredential();
      if (cred.token && !skipAnalytics) {
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
        let stopEnrichment = false;
        for (let i = 0; i < targets.length && !stopEnrichment; i += 8) {
          const chunk = targets.slice(i, i + 8);
          const fetched = await Promise.all(chunk.map(async (t: any) => {
            const pid = String(t.provider_message_id);
            const url = `https://graph.facebook.com/v26.0/${encodeURIComponent(pid)}?fields=${encodeURIComponent(graphFields)}&access_token=${encodeURIComponent(cred.token)}`;
            try {
              const resp = await fetch(url);
              const payload: any = await resp.json().catch(() => ({}));
              return { t, pid, ok: resp.ok, status: resp.status, payload };
            } catch (error) {
              return {
                t,
                pid,
                ok: false,
                status: 0,
                payload: { error: { message: error instanceof Error ? error.message : String(error) } },
              };
            }
          }));

          for (const result of fetched) {
            if (!result.ok) {
              const graphError = result.payload?.error ?? result.payload;
              console.error("[fb-recent-posts] enrichment graph error", {
                post_id: result.pid,
                http_status: result.status,
                token_source: cred.source,
                code: graphError?.code ?? null,
                subcode: graphError?.error_subcode ?? null,
                message: graphError?.message ?? null,
              });
              if (isMetaPermissionError(graphError)) stopEnrichment = true;
              continue;
            }

            const t = result.t;
            const pid = result.pid;
            const entry = result.payload;
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



    const syncErrorDetail = lastError ? describeMetaError(lastError, lastStatus) : null;
    if (syncErrorDetail) {
      // Full Graph refusal payload in the logs: Development Mode / unverified
      // business blocks are otherwise indistinguishable from a declined scope.
      console.error("[fb-recent-posts] graph refusal", JSON.stringify({
        owner_id: ownerId,
        page_id: page?.pageId ?? null,
        http_status: lastStatus,
        kind: syncErrorDetail.kind,
        code: syncErrorDetail.code,
        subcode: syncErrorDetail.subcode,
        type: syncErrorDetail.type,
        fbtrace_id: syncErrorDetail.fbtrace_id,
        dev_mode_restricted: syncErrorDetail.dev_mode_restricted,
        raw: lastError,
      }));
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
        pruned_missing: prunedMissing,
        persist_error: persistError,

        owner_id: ownerId,
        raw_status: lastStatus,
        raw_error: lastError,
        graph_source: graphSource,
        permission_blocked: permissionBlocked,
        // A stored Page binding stays a live connection even when a single read
        // is refused, so the client must never flip to "disconnected" here.
        page_connected: !!page?.pageId,
        needs_extension: permissionBlocked && posts.length === 0,
        // Exact Graph failure (code/subcode/type/message/trace) so the UI can
        // tell the user precisely why the sync did not complete.
        sync_error: syncErrorDetail,
        // Clear, human-readable reason when a refresh returned nothing.
        error: posts.length === 0 && syncErrorDetail ? syncErrorDetail.message_he : null,
        diagnostics,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const detail = describeMetaError(e instanceof Error ? e.message : String(e), null);
    return new Response(
      JSON.stringify({
        ok: false,
        sync_error: detail,
        error: detail.message_he,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

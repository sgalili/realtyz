// Realtyz comments-fetch — pulls live comments via Ayrshare's native
// /api/comments/{ayrshareTopLevelId}?platforms=facebook endpoint using the
// healthy workspace profile key. Direct Meta Graph queries were retired
// because the stored FB user access token expires constantly (code 190 /
// subcode 467). Ayrshare keeps a server-side Page token alive for us.
// Strict tenant isolation: user_id is required and scopes every DB query.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  resolveOwnPageIdentity,
  resolveWorkspaceProfileKey,
  isSelfAuthoredComment,
  AYR_BASE,
} from "../_shared/ayrshare-helpers.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isUuid = (value: unknown) =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());

const safeMetaPayload = (payload: any, text = "") => ({
  message: payload?.message ?? payload?.error?.message ?? payload?.error ?? payload?.errors?.[0]?.message ?? text.slice(0, 500) ?? null,
  code: payload?.code ?? payload?.error?.code ?? payload?.errors?.[0]?.code ?? null,
  raw: payload && Object.keys(payload).length ? payload : text.slice(0, 1000),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  try {
    const AYR_KEY = Deno.env.get("AYRSHARE_API_KEY")?.trim().replace(/^["']|["']$/g, "") || null;
    if (!AYR_KEY) return json({ error: "AYRSHARE_API_KEY not configured" }, 500);
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { profileKey } = await resolveWorkspaceProfileKey(admin);
    if (!profileKey) return json({ error: "workspace_ayrshare_profile_not_linked" }, 200);

    let body: any = {};
    try {
      body = await req.json();
    } catch { /* noop */ }

    const requestedPostIds: string[] = Array.isArray(body?.post_ids)
      ? body.post_ids.filter((s: unknown): s is string => typeof s === "string" && s.length > 0)
      : typeof body?.post_id === "string"
      ? [body.post_id]
      : [];
    if (requestedPostIds.length === 0) return json({ error: "post_ids required" }, 400);

    // Resolve tenant. Body wins; otherwise extract from caller JWT.
    let userId: string | null = typeof body?.user_id === "string" ? body.user_id : null;
    if (!userId) {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      if (token) {
        try {
          const { data } = await admin.auth.getUser(token);
          userId = data?.user?.id ?? null;
        } catch { /* ignore */ }
      }
    }
    if (!userId) return json({ error: "user_id required" }, 401);

    // Force-refresh: null out cached avatar URLs on existing rows for the
    // requested posts so the next ingest pass re-resolves a fresh CDN URL.
    const forceRefresh: boolean = !!body?.force_refresh;
    if (forceRefresh) {
      const { data: stale } = await admin
        .from("engagement_events")
        .select("id, metadata")
        .eq("user_id", userId)
        .in("external_post_id", requestedPostIds);
      for (const row of stale ?? []) {
        const meta: any = (row as any).metadata && typeof (row as any).metadata === "object" ? (row as any).metadata : {};
        const author = meta.author && typeof meta.author === "object" ? meta.author : {};
        const next = {
          ...meta,
          profile_image: null,
          sender_avatar_url: null,
          author: { ...author, profile_image: null },
        };
        await admin.from("engagement_events").update({ metadata: next }).eq("id", (row as any).id).eq("user_id", userId);
      }
    }

    const campaignName: string | null =
      typeof body?.campaign_name === "string" ? body.campaign_name : null;
    const platformHint =
      typeof body?.platform === "string" && body.platform.trim()
        ? body.platform.trim().toLowerCase()
        : "facebook";

    type CommentFetchTarget = { fetchPostId: string; nativePostId: string; platform: string; permalinkAliases?: string[] };
    const targets = new Map<string, CommentFetchTarget>();

    // Recursively walk a provider_response blob and pull out every Facebook
    // permalink alias Ayrshare can resolve with searchPlatformId=true:
    // - long story ids: pfbid...
    // - short share permalink tokens: facebook.com/share/p/{token}
    const extractFacebookPermalinkAliases = (root: any): string[] => {
      const seen = new Set<any>();
      const aliases = new Set<string>();
      const pfbidRe = /pfbid[0-9A-Za-z]+/g;
      const shareTokenRe = /facebook\.com\/share\/p\/([^/?#\s"'<]+)/gi;
      const addFromString = (value: string) => {
        for (const m of value.matchAll(pfbidRe)) if (m[0]) aliases.add(m[0]);
        for (const m of value.matchAll(shareTokenRe)) {
          const token = decodeURIComponent(String(m[1] || "")).replace(/\/+$/, "").trim();
          if (/^[0-9A-Za-z_-]{5,}$/.test(token)) aliases.add(token);
        }
      };
      const visit = (node: any) => {
        if (node == null) return null;
        if (typeof node === "string") {
          addFromString(node);
          return null;
        }
        if (typeof node !== "object" || seen.has(node)) return null;
        seen.add(node);
        if (Array.isArray(node)) {
          for (const item of node) visit(item);
          return null;
        }
        for (const v of Object.values(node)) visit(v);
        return null;
      };
      visit(root);
      return Array.from(aliases);
    };
    const requested = new Set(requestedPostIds.map((id) => String(id).trim()).filter(Boolean));

    // Resolve to one canonical target per campaign: fetch with Ayrshare's top-level
    // id, store under the native Facebook composite id used by the UI.
    try {
      const { data: campaigns, error: campaignErr } = await admin
        .from("campaign_logs")
        .select("channel, provider_message_id, provider_response")
        .eq("user_id", userId)
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .limit(200);
      if (campaignErr) {
        console.error("[ayrshare-comments-fetch] campaign lookup failed", campaignErr.message);
      }

      for (const row of campaigns ?? []) {
        const response: any = (row as any).provider_response ?? {};
        const wrappedPosts: any[] = Array.isArray(response?.posts) ? response.posts : [];
        const flatPosts: any[] = response?.id ? [response] : [];
        const providerMsgId = typeof (row as any).provider_message_id === "string" ? (row as any).provider_message_id.trim() : "";
        const rowChannel = String((row as any).channel || platformHint).toLowerCase();
        const permalinkAliases = extractFacebookPermalinkAliases(response);

        // Path A: rows that include Ayrshare-minted top-level ids.
        let matchedFromPosts = false;
        for (const post of [...flatPosts, ...wrappedPosts]) {
          const topId = typeof post?.id === "string" ? post.id.trim() : "";
          const postIds = Array.isArray(post?.postIds) ? post.postIds : [];
          const nativeForPlatform =
            postIds.find((p: any) => String(p?.platform || "").toLowerCase() === platformHint)?.id ??
            postIds[0]?.id ??
            providerMsgId ??
            null;
          const nativeId = typeof nativeForPlatform === "string" ? nativeForPlatform.trim() : "";
          const aliases = [topId, nativeId, providerMsgId, ...permalinkAliases].map((v) => String(v || "").trim()).filter(Boolean);
          if (!topId || !nativeId || !aliases.some((alias) => requested.has(alias))) continue;
          const platform = String(
            postIds.find((p: any) => String(p?.id || "") === nativeId)?.platform ||
            rowChannel,
          ).toLowerCase();
          targets.set(nativeId, { fetchPostId: topId, nativePostId: nativeId, platform: platform || platformHint, permalinkAliases });
          matchedFromPosts = true;
        }

        // Path B: legacy rows with NO Ayrshare top id.
        if (!matchedFromPosts && providerMsgId && (requested.has(providerMsgId) || permalinkAliases.some((alias) => requested.has(alias)))) {
          targets.set(providerMsgId, {
            fetchPostId: providerMsgId,
            nativePostId: providerMsgId,
            platform: rowChannel || platformHint,
            permalinkAliases,
          });
        }
      }
    } catch (lookupErr) {
      console.error("[ayrshare-comments-fetch] campaign lookup threw", lookupErr instanceof Error ? lookupErr.message : String(lookupErr));
    }

    // Fallback for manual diagnostic calls with a direct Ayrshare id. Store under
    // the provided id only when no campaign mapping exists.
    if (targets.size === 0) {
      requestedPostIds.forEach((id) => {
        const clean = String(id).trim();
        if (clean) targets.set(clean, { fetchPostId: clean, nativePostId: clean, platform: platformHint });
      });
    }

    const ownPage = await resolveOwnPageIdentity(admin);

    const pickStr = (...vals: unknown[]) => {
      for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
      return null;
    };
    const pickText = (item: any): string | null =>
      pickStr(item?.comment, item?.text, item?.message, item?.commentString, item?.textContent, item?.body);
    const resolveAuthorPicture = (_comment: any): string | null => null;


    const results: Record<string, any[]> = {};
    const errors: Record<string, string> = {};
    const apiErrors: any[] = [];
    const mappingErrors: any[] = [];
    const metricsByPostId = new Map<string, { likes: number | null; shares: number | null; comments: number | null }>();

    const extractChildComments = (node: any): any[] => {
      if (!node || typeof node !== "object") return [];
      return [
        ...(Array.isArray(node.replies) ? node.replies : []),
        ...(Array.isArray(node.children) ? node.children : []),
        ...(Array.isArray(node.comments) ? node.comments : []),
        ...(Array.isArray(node.thread) ? node.thread : []),
        ...(Array.isArray(node?.replies?.data) ? node.replies.data : []),
        ...(Array.isArray(node?.comments?.data) ? node.comments.data : []),
      ];
    };

    const fetchAyrshareComments = async (id: string, platform: string, useSearchPlatformId = false) => {
      // CRITICAL: with searchPlatformId=true Ayrshare expects the SINGULAR
      // `platform` query param. Sending `platforms=` alongside searchPlatformId
      // makes Ayrshare return error 156 ("social network is not linked") even
      // when the network IS linked. Verified live on 2026-06-11.
      const qs = useSearchPlatformId
        ? `platform=${encodeURIComponent(platform)}&searchPlatformId=true`
        : `platforms=${encodeURIComponent(platform)}`;
      const url = `${AYR_BASE}/comments/${encodeURIComponent(id)}?${qs}`;
      try {
        // Strict 10s timeout: if Ayrshare hangs, abort gracefully so the
        // function ALWAYS terminates and the UI spinner is released.
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${AYR_KEY}`,
            "Profile-Key": profileKey,
            "Cache-Control": "no-cache",
          },
          signal: AbortSignal.timeout(10_000),
        });
        const text = await res.text();
        let payload: any = {};
        try { payload = text ? JSON.parse(text) : {}; } catch { payload = { rawText: text }; }
        return { ok: res.ok, status: res.status, payload, text };
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.warn("[ayrshare-comments-fetch] comments fetch aborted/failed", { id, msg });
        return { ok: false, status: 0, payload: { message: msg, timeout: true }, text: "" };
      }
    };

    // POST /api/analytics/post — returns the OUTER post's like/share/comment
    // totals (the /comments endpoint only returns the comment thread, never
    // share counts). We call this concurrently with the comments fetch and
    // merge whichever numbers come back. Failures are non-fatal.
    const fetchAyrsharePostAnalytics = async (id: string, platform: string, useSearchPlatformId = false) => {
      try {
        const body: Record<string, unknown> = { id, platforms: [platform] };
        if (useSearchPlatformId) body.searchPlatformId = true;
        const res = await fetch(`${AYR_BASE}/analytics/post`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${AYR_KEY}`,
            "Profile-Key": profileKey,
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });
        const text = await res.text();
        let payload: any = {};
        try { payload = text ? JSON.parse(text) : {}; } catch { payload = { rawText: text }; }
        return { ok: res.ok, status: res.status, payload };
      } catch (e) {
        return { ok: false, status: 0, payload: { message: e instanceof Error ? e.message : String(e) } };
      }
    };

    // Extracts numeric like/share/comment counts from the /analytics/post
    // shape, which differs from /comments: numbers live under
    // payload.analytics.<platform> or payload.<platform>.analytics with keys
    // like reactionsCount / shareCount / commentsCount / likeCount.
    const extractAnalyticsMetrics = (payload: any, platformKey: string) => {
      const candidates: any[] = [];
      const push = (n: any) => { if (n && typeof n === "object") candidates.push(n); };
      push(payload);
      push(payload?.analytics);
      push(payload?.[platformKey]);
      push(payload?.[platformKey]?.analytics);
      push(payload?.analytics?.[platformKey]);
      push(payload?.post);
      push(payload?.post?.analytics);
      const pickNum = (...keys: string[]): number | null => {
        for (const src of candidates) for (const k of keys) {
          const v = src?.[k];
          if (typeof v === "number" && Number.isFinite(v)) return v;
          if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
        }
        return null;
      };
      return {
        likes: pickNum("likeCount", "likes", "like_count", "reactionsCount", "reactions", "reactions_count"),
        shares: pickNum("shareCount", "shares", "share_count", "sharesCount", "shares_count"),
        comments: pickNum("commentsCount", "comments_count", "commentCount", "comment_count", "totalComments"),
      };
    };

    // NOTE: we intentionally do NOT normalize Ayrshare nodes into a stripped
    // shape before walking — doing so would discard the nested `replies` /
    // `children` arrays and we'd only flatten the top level. The walker
    // (which uses extractChildComments) handles every known nesting shape,
    // and pickStr / pickText downstream already accept the raw Ayrshare keys
    // (comment / commentId / from / createdAt / etc.).

    const extractCommentsArray = (payload: any, platformKey: string): any[] =>
      Array.isArray(payload?.[platformKey])
        ? payload[platformKey]
        : Array.isArray(payload?.comments)
        ? payload.comments
        : Array.isArray(payload)
        ? payload
        : [];

    // Outer network metrics from the /comments payload. Ayrshare/Meta shapes
    // vary — accept top-level numbers, `analytics`, `metrics`, or platform-
    // nested blocks. Used to overwrite campaign_logs like/share/comment counts
    // (force-refresh — even zeros are overwritten).
    const extractOuterMetrics = (payload: any, platformKey: string) => {
      const sources: any[] = [
        payload, payload?.analytics, payload?.metrics, payload?.summary, payload?.post,
        payload?.[platformKey], payload?.[platformKey]?.analytics, payload?.[platformKey]?.metrics,
      ].filter(Boolean);
      const pickNum = (...keys: string[]): number | null => {
        for (const src of sources) for (const k of keys) {
          const v = (src as any)?.[k];
          if (typeof v === "number" && Number.isFinite(v)) return v;
          if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
        }
        return null;
      };
      return {
        likes: pickNum("likeCount", "likes", "like_count", "reactions", "reactionsCount", "reactions_count"),
        shares: pickNum("shareCount", "shares", "share_count", "sharesCount", "shares_count"),
        comments: pickNum("commentsCount", "comments_count", "commentCount", "comment_count", "totalComments"),
      };
    };

    const fetchAyrshareTree = async (target: CommentFetchTarget) => {
      const attempts: any[] = [];
      const platformKey = target.platform.toLowerCase();

      // Attempt 1: query by Ayrshare's own top-level id (works for posts
      // published under the currently-active workspace profile). For legacy
      // rows where we only know the native FB composite id (pageId_postId),
      // use searchPlatformId=true on the primary attempt.
      const looksNative = /_/.test(target.fetchPostId);
      const primary = await fetchAyrshareComments(target.fetchPostId, target.platform, looksNative);
      const primaryArr = extractCommentsArray(primary.payload, platformKey);
      const primaryMetrics = extractOuterMetrics(primary.payload, platformKey);
      const primaryOk = primary.ok && primary.payload?.status !== "error" && primaryArr.length > 0;
      if (primaryOk) {
        return {
          ok: true,
          status: primary.status,
          resolvedPostId: target.fetchPostId,
          comments: primaryArr,
          outerMetrics: primaryMetrics,
          attempts,
        };
      }
      attempts.push({ post_id: target.fetchPostId, mode: "ayrshare_top_level", status: primary.status, payload: safeMetaPayload(primary.payload, primary.text) });

      let bestEmptyOk: { status: number; resolvedPostId: string; outerMetrics: ReturnType<typeof extractOuterMetrics> } | null = null;
      if (primary.ok && primary.payload?.status !== "error") {
        bestEmptyOk = { status: primary.status, resolvedPostId: target.fetchPostId, outerMetrics: primaryMetrics };
      }
      if (target.nativePostId && target.nativePostId !== target.fetchPostId) {
        const fallback = await fetchAyrshareComments(target.nativePostId, target.platform, true);
        const fallbackArr = extractCommentsArray(fallback.payload, platformKey);
        const fallbackMetrics = extractOuterMetrics(fallback.payload, platformKey);
        if (fallback.ok && fallback.payload?.status !== "error" && fallbackArr.length > 0) {
          console.log("[ayrshare-comments-fetch] native FB id fallback hit", { native: target.nativePostId, count: fallbackArr.length });
          return {
            ok: true,
            status: fallback.status,
            resolvedPostId: target.nativePostId,
            comments: fallbackArr,
            outerMetrics: fallbackMetrics,
            attempts: [...attempts, { post_id: target.nativePostId, mode: "native_fb_searchPlatformId", status: fallback.status, count: fallbackArr.length }],
          };
        }
        if (fallback.ok && fallback.payload?.status !== "error" && !bestEmptyOk) {
          bestEmptyOk = { status: fallback.status, resolvedPostId: target.nativePostId, outerMetrics: fallbackMetrics };
        }
        attempts.push({ post_id: target.nativePostId, mode: "native_fb_searchPlatformId", status: fallback.status, count: fallbackArr.length, payload: fallbackArr.length === 0 ? safeMetaPayload(fallback.payload, fallback.text) : undefined });
      }

      if (target.nativePostId === target.fetchPostId && !/_/.test(target.fetchPostId)) {
        const directAlias = await fetchAyrshareComments(target.fetchPostId, target.platform, true);
        const directAliasArr = extractCommentsArray(directAlias.payload, platformKey);
        const directAliasMetrics = extractOuterMetrics(directAlias.payload, platformKey);
        if (directAlias.ok && directAlias.payload?.status !== "error" && directAliasArr.length > 0) {
          console.log("[ayrshare-comments-fetch] direct share-token fallback hit", { token: target.fetchPostId, count: directAliasArr.length });
          return {
            ok: true,
            status: directAlias.status,
            resolvedPostId: target.nativePostId,
            comments: directAliasArr,
            outerMetrics: directAliasMetrics,
            attempts: [...attempts, { post_id: target.fetchPostId, mode: "direct_share_token_searchPlatformId", status: directAlias.status, count: directAliasArr.length }],
          };
        }
        attempts.push({ post_id: target.fetchPostId, mode: "direct_share_token_searchPlatformId", status: directAlias.status, count: directAliasArr.length, payload: directAliasArr.length === 0 ? safeMetaPayload(directAlias.payload, directAlias.text) : undefined });
      }

      for (const alias of target.permalinkAliases ?? []) {
        if (!alias || alias === target.fetchPostId || alias === target.nativePostId) continue;
        const aliasFetch = await fetchAyrshareComments(alias, target.platform, true);
        const aliasArr = extractCommentsArray(aliasFetch.payload, platformKey);
        const aliasMetrics = extractOuterMetrics(aliasFetch.payload, platformKey);
        const aliasMode = alias.startsWith("pfbid") ? "pfbid_searchPlatformId" : "share_token_searchPlatformId";
        if (aliasFetch.ok && aliasFetch.payload?.status !== "error" && aliasArr.length > 0) {
          console.log("[ayrshare-comments-fetch] permalink alias hit", { alias, mode: aliasMode, count: aliasArr.length });
          return {
            ok: true,
            status: aliasFetch.status,
            resolvedPostId: target.nativePostId,
            comments: aliasArr,
            outerMetrics: aliasMetrics,
            attempts: [...attempts, { post_id: alias, mode: aliasMode, status: aliasFetch.status, count: aliasArr.length }],
          };
        }
        attempts.push({ post_id: alias, mode: aliasMode, status: aliasFetch.status, count: aliasArr.length, payload: aliasArr.length === 0 ? safeMetaPayload(aliasFetch.payload, aliasFetch.text) : undefined });
      }

      if (bestEmptyOk) {
        return { ok: true, status: bestEmptyOk.status, resolvedPostId: bestEmptyOk.resolvedPostId, comments: [], outerMetrics: bestEmptyOk.outerMetrics, attempts };
      }
      return { ok: false, status: primary.status || 500, resolvedPostId: null, comments: [], outerMetrics: { likes: null, shares: null, comments: null }, attempts };
    };

    await Promise.all(
      Array.from(targets.values()).map(async (target) => {
        const { fetchPostId, nativePostId, platform } = target;
        const activeRefId = "ayrshare_comments_native";
        try {
          if (isUuid(fetchPostId) || isUuid(nativePostId)) {
            const mappingError = {
              post_id: nativePostId,
              fetch_post_id: fetchPostId,
              platform,
              error: "internal_uuid_was_mapped_as_external_post_id",
            };
            mappingErrors.push(mappingError);
            console.error("[ayrshare-comments-fetch] invalid external id mapping", mappingError);
            errors[nativePostId] = mappingError.error;
            results[nativePostId] = [];
            return;
          }
          if (!/^facebook$/i.test(platform)) {
            errors[nativePostId] = "ayrshare_comments_only_supports_facebook_in_this_function";
            results[nativePostId] = [];
            return;
          }

          const looksNativeForAnalytics = /_/.test(target.fetchPostId);
          // Run /comments and /analytics/post concurrently. The analytics call
          // is wrapped in its own try/catch and `Promise.allSettled` so any
          // unexpected payload shape or network error can NEVER crash the
          // comments pipeline — the UI must always get an answer.
          const [commentsSettled, analyticsSettled] = await Promise.allSettled([
            fetchAyrshareTree(target),
            (async () => {
              try {
                return await fetchAyrsharePostAnalytics(target.fetchPostId, target.platform, looksNativeForAnalytics);
              } catch (anaErr) {
                console.warn("[ayrshare-comments-fetch] analytics threw", anaErr instanceof Error ? anaErr.message : String(anaErr));
                return null;
              }
            })(),
          ]);
          if (commentsSettled.status !== "fulfilled") {
            errors[nativePostId] = commentsSettled.reason instanceof Error ? commentsSettled.reason.message : String(commentsSettled.reason);
            results[nativePostId] = [];
            return;
          }
          const fetched = commentsSettled.value;
          let analytics = analyticsSettled.status === "fulfilled" ? analyticsSettled.value : null;
          // Legacy posts published under a previous (suspended) Ayrshare profile
          // 404 on their old top-level id. Retry analytics with the native FB
          // composite id + searchPlatformId, which the live profile CAN resolve.
          if ((!analytics || !analytics.ok) && target.nativePostId && target.nativePostId !== target.fetchPostId) {
            try {
              const retry = await fetchAyrsharePostAnalytics(target.nativePostId, target.platform, true);
              if (retry?.ok) analytics = retry;
            } catch { /* non-fatal */ }
          }
          const arr: any[] = fetched.comments;
          if (!fetched.ok) {
            const apiError = {
              post_id: nativePostId,
              fetch_post_id: fetchPostId,
              platform,
              status: fetched.status,
              payload: fetched.attempts[fetched.attempts.length - 1]?.payload ?? { message: "Ayrshare /comments rejected request" },
              attempts: fetched.attempts,
            };
            apiErrors.push(apiError);
            console.error("[ayrshare-comments-fetch] Ayrshare rejected request", apiError);
            errors[nativePostId] = `HTTP ${fetched.status}: ${apiError.payload.message ?? "Ayrshare /comments rejected request"}`;
            results[nativePostId] = [];
            return;
          }
          // Merge: prefer /analytics/post numbers (authoritative for share &
          // like counts on the outer post); fall back to anything /comments
          // happened to return inline. Bulletproof: any extractor exception
          // is swallowed and we keep the /comments inline numbers.
          let merged = fetched.outerMetrics ?? { likes: null, shares: null, comments: null };
          try {
            if (analytics?.ok && analytics.payload) {
              const platformKey = target.platform.toLowerCase();
              const root: any = analytics.payload ?? {};
              const platformBlock: any =
                root?.analytics?.[platformKey] ?? root?.[platformKey]?.analytics ?? root?.[platformKey] ?? null;
              const arrayPick = (val: any) => Array.isArray(val) && val.length ? val[0] : val;
              const block = arrayPick(platformBlock) || {};
              try {
                console.log("[ayrshare-comments-fetch] analytics block dump", JSON.stringify(block).slice(0, 1500));
              } catch { /* noop */ }
              const robustExtract = extractAnalyticsMetrics(analytics.payload, platformKey);
              // TOTAL REACTIONS, not just "Like": Facebook's UI like badge
              // counts every reaction type. Sum ONLY known reaction-type keys
              // (a generic Object.values sum once swallowed impression metrics
              // and produced a bogus 60). likedBy array length is also a
              // ground-truth signal when present.
              const REACTION_KEYS = ["like", "love", "wow", "haha", "sad", "angry", "care", "thankful", "pride"];
              const sumReactions = (src: any): number | null => {
                for (const cand of [src?.reactions, src?.reactionsByType, src?.reaction_counts]) {
                  if (cand && typeof cand === "object" && !Array.isArray(cand)) {
                    let total = 0; let found = false;
                    for (const k of REACTION_KEYS) {
                      const v = (cand as any)[k];
                      const n = typeof v === "number" ? v : Number(v);
                      if (Number.isFinite(n)) { total += n; found = true; }
                    }
                    if (found) return total;
                  }
                  if (typeof cand === "number" && Number.isFinite(cand)) return cand;
                }
                for (const k of ["reactionsCount", "totalReactions", "reactions_total"]) {
                  const v = src?.[k];
                  if (typeof v === "number" && Number.isFinite(v)) return v;
                }
                return null;
              };
              const reactionsTotal = sumReactions(block) ?? sumReactions(root?.analytics);
              const likedByCount = Array.isArray(block?.likedBy) ? block.likedBy.length : null;
              const plainLikes =
                (typeof block?.likeCount === "number" ? block.likeCount : null) ??
                robustExtract.likes ??
                (typeof root?.analytics?.likeCount === "number" ? root.analytics.likeCount : null) ??
                (typeof root?.metrics?.likes === "number" ? root.metrics.likes : null);
              const likeCount = reactionsTotal !== null || plainLikes !== null || likedByCount !== null
                ? Math.max(reactionsTotal ?? 0, plainLikes ?? 0, likedByCount ?? 0)
                : null;
              const shareCount =
                (typeof block?.shareCount === "number" ? block.shareCount : null) ??
                robustExtract.shares ??
                (typeof root?.analytics?.shareCount === "number" ? root.analytics.shareCount : null) ??
                (typeof root?.metrics?.shares === "number" ? root.metrics.shares : null);
              const commentCount =
                (typeof block?.commentsCount === "number" ? block.commentsCount : null) ??
                (typeof block?.commentCount === "number" ? block.commentCount : null) ??
                robustExtract.comments ??
                (typeof root?.analytics?.commentCount === "number" ? root.analytics.commentCount : null) ??
                (typeof root?.metrics?.comments === "number" ? root.metrics.comments : null);
              merged = {
                likes: typeof likeCount === "number" ? likeCount : merged.likes,
                shares: typeof shareCount === "number" ? shareCount : merged.shares,
                comments: typeof commentCount === "number" ? commentCount : merged.comments,
              };
              console.log("[ayrshare-comments-fetch] analytics merged", { stored: nativePostId, likeCount, shareCount, commentCount, final: merged });
            } else if (analytics) {
              console.warn("[ayrshare-comments-fetch] analytics fetch non-ok", { stored: nativePostId, status: analytics.status });
            }
          } catch (mergeErr) {
            console.error("[ayrshare-comments-fetch] analytics merge crashed (graceful fallback)", mergeErr instanceof Error ? mergeErr.message : String(mergeErr));
          }
          console.log("[ayrshare-comments-fetch] ayrshare comments success", { stored: nativePostId, resolved: fetched.resolvedPostId, count: arr.length, metrics: merged });
          metricsByPostId.set(nativePostId, merged);

          // Flatten N levels of nested replies. Ayrshare/Meta nest child nodes
          // under any of: replies / children / comments / thread / data, so we
          // walk every known shape and tag each node with its parent id.
          const flat: any[] = [];
          const walk = (node: any, parent: string | null, depth = 0) => {
            if (!node || typeof node !== "object" || depth > 6) return;
            // Preserve any parent id already set by an upstream source (e.g.
            // Meta Graph fast path) so we don't flatten Graph replies to roots.
            const existingParent = typeof (node as any).__parent_id === "string" ? (node as any).__parent_id : null;
            (node as any).__parent_id = parent ?? existingParent;
            (node as any).__profile_ref_id = activeRefId;
            flat.push(node);
            const kids = [
              ...extractChildComments(node),
            ];
            const myId = pickStr(node.id, node.commentId, node.comment_id);
            for (const k of kids) walk(k, myId || parent, depth + 1);
          };
          for (const c of arr) {
            const rawParent = pickStr((c as any)?.__parent_id, (c as any)?.parentId, (c as any)?.parent?.id);
            walk(c, rawParent);
          }
          results[nativePostId] = flat;
        } catch (err) {
          errors[nativePostId] = err instanceof Error ? err.message : String(err);
          results[nativePostId] = [];
        }
      }),
    );

    // Persist into engagement_events (dedup by user_id + external_id).
    let persisted = 0;
    let skipped = 0;
    const toDispatch: Array<{
      external_id: string;
      external_post_id: string;
      sender_handle: string | null;
      sender_id: string | null;
      inbound_text: string;
      platform: string;
      parent_id: string | null;
    }> = [];

    let blockedSelf = 0;
    for (const [postId, list] of Object.entries(results)) {
      for (const [index, c] of (list ?? []).entries()) {
        const text = pickText(c) || "";
        if (!text.trim()) continue;
        const nativeId =
          pickStr(c?.id, c?.commentId, c?.comment_id, c?.platformCommentId) ??
          `${postId}_comment_${index}`;
        const sender = pickStr(
          c?.from?.name,
          c?.user?.name,
          c?.username,
          c?.sender,
          c?.author,
        );
        const senderId = pickStr(c?.from?.id, c?.user?.id, c?.fromId, c?.sender_id, c?.userId);
        const parentId = typeof c?.__parent_id === "string" ? c.__parent_id : null;
        // SENDER FIREWALL: comments authored by our own Page must still be
        // stored so the UI can render the physical Facebook reply tree, but
        // they are marked display-only and never dispatched back to the AI.
        const selfAuthored = isSelfAuthoredComment({
          fromId: senderId,
          fromName: sender,
          text,
          ownPageId: ownPage.pageId,
          ownPageName: ownPage.pageName,
        });
        if (selfAuthored && !parentId) {
          blockedSelf += 1;
          console.log("[ayrshare-comments-fetch] blocked root self-authored comment", { nativeId, senderId, sender });
          continue;
        }
        const safeStr = (v: unknown, max = 500): string | null => {
          if (v === null || v === undefined) return null;
          const s = typeof v === "string" ? v : (() => {
            try { return JSON.stringify(v); } catch { return String(v); }
          })();
          const trimmed = s.trim();
          return trimmed ? trimmed.slice(0, max) : null;
        };
        // No secondary avatar/profile HTTP calls. Keep avatars null so the edge
        // function performs only the single Ayrshare comments request per target.
        const authorPicture = resolveAuthorPicture(c);

        const { data: exists } = await admin
          .from("engagement_events")
          .select("id, status, ai_reply_text, metadata")
          .eq("user_id", userId)
          .eq("external_id", nativeId)
          .maybeSingle();

        if (exists?.id) {
          skipped += 1;
          const currentMeta = ((exists as any).metadata && typeof (exists as any).metadata === "object") ? (exists as any).metadata : {};
          const currentAuthor = (currentMeta.author && typeof currentMeta.author === "object") ? currentMeta.author : {};
          const nextMetadata = {
            ...currentMeta,
            parent_id: safeStr(parentId) ?? currentMeta.parent_id ?? null,
            self_authored: selfAuthored || currentMeta.self_authored === true,
            author_type: selfAuthored ? "workspace_page" : currentMeta.author_type ?? "audience",
            sender_id: safeStr(senderId) ?? currentMeta.sender_id ?? null,
            profile_image: null,
            sender_avatar_url: null,
            author: {
              ...currentAuthor,
              name: safeStr(sender, 200) ?? currentAuthor.name ?? null,
              profile_image: null,
            },
          };
          await admin
            .from("engagement_events")
            .update({
              external_post_id: postId,
              sender_handle: safeStr(sender, 200),
              inbound_text: safeStr(text, 4000) ?? "",
              platform: platformHint,
              metadata: nextMetadata,
            })
            .eq("id", exists.id)
            .eq("user_id", userId);
          // Re-dispatch only if still pending and no reply yet.
          if (!selfAuthored && !exists.ai_reply_text && exists.status !== "sent" && exists.status !== "pending_approval") {
            toDispatch.push({
              external_id: nativeId,
              external_post_id: postId,
              sender_handle: sender,
              sender_id: senderId,
              inbound_text: text,
              platform: platformHint,
              parent_id: parentId,
            });
          }
          continue;
        }

        // Sanitize: keep ONLY flat scalar fields in metadata. The raw Meta
        // payload can contain nested reply/user blobs that may violate jsonb
        // size/shape constraints and cause the insert to fail silently.
        const cleanMetadata = {
          source: "ayrshare_comments_fetch",
          campaign_name: safeStr(campaignName),
          profile_ref_id: safeStr(c?.__profile_ref_id ?? "ayrshare_comments_native"),
          parent_id: safeStr(parentId),
          self_authored: selfAuthored,
          author_type: selfAuthored ? "workspace_page" : "audience",
          native_created_at: safeStr(c?.created_time ?? c?.createdAt ?? c?.created_at ?? c?.timestamp),
          like_count: typeof c?.like_count === "number" ? c.like_count : null,
          permalink: safeStr(c?.permalink ?? c?.permalink_url ?? c?.url, 1000),
          sender_id: safeStr(senderId),
          profile_image: safeStr(authorPicture, 1000),
          sender_avatar_url: safeStr(authorPicture, 1000),
          author: {
            name: safeStr(sender, 200),
            profile_image: safeStr(authorPicture, 1000),
          },
        };
        const cleanText = safeStr(text, 4000) ?? "";
        const cleanSender = safeStr(sender, 200);

        const payload = {
          user_id: userId,
          platform: platformHint,
          sender_handle: cleanSender,
          inbound_text: cleanText,
          external_id: nativeId,
          external_post_id: postId,
          status: selfAuthored ? "sent" : "pending",
          ai_action: selfAuthored ? "display_only" : "queued",
          metadata: cleanMetadata,
        };

        try {
          // Plain insert — the duplicate-guard above (select by user_id +
          // external_id) already handles dedup. We can't use upsert with
          // onConflict because the unique index on (user_id, external_id) is
          // partial (WHERE external_id IS NOT NULL), which PostgREST's
          // ON CONFLICT clause cannot match (error 42P10).
          const { error: insErr } = await admin
            .from("engagement_events")
            .insert(payload);
          if (insErr) {
            console.error(
              "[ayrshare-comments-fetch] insert failed",
              JSON.stringify({
                message: insErr.message,
                code: (insErr as any).code,
                details: (insErr as any).details,
                hint: (insErr as any).hint,
                payload,
              }),
            );
            continue;
          }
          persisted += 1;
        } catch (writeErr) {
          console.error(
            "[ayrshare-comments-fetch] insert threw",
            JSON.stringify({
              error: writeErr instanceof Error ? writeErr.message : String(writeErr),
              payload,
            }),
          );
          continue;
        }
        if (!selfAuthored) {
          toDispatch.push({
            external_id: nativeId,
            external_post_id: postId,
            sender_handle: cleanSender,
            sender_id: senderId,
            inbound_text: cleanText,
            platform: platformHint,
            parent_id: parentId,
          });
        } else {
          blockedSelf += 1;
        }

      }
    }

    // Chain to auto-engagement-process (fire-and-forget).
    await Promise.all(
      toDispatch.map((d) =>
        fetch(`${SUPABASE_URL}/functions/v1/auto-engagement-process`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            platform: d.platform,
            event_type: "comment",
            inbound_text: d.inbound_text,
            external_id: d.external_id,
            external_post_id: d.external_post_id,
            sender_handle: d.sender_handle,
            sender_name: d.sender_handle,
            metadata: { parent_id: d.parent_id, sender_id: d.sender_id, source: "ayrshare_comments_fetch" },
          }),
        }).catch((e) => console.error("[ayrshare-comments-fetch] dispatch failed", e)),
      ),
    );

    // Sync campaign_logs counters (comment_count + like_count + share_count)
    // with live Meta numbers.
    // comment_count is AUTHORITATIVELY calculated from the full flattened
    // comment tree (top-level + every nested reply parsed by the walker) —
    // Ayrshare's analytics.commentCount integer lags behind the real thread
    // and is used only as a floor, never as the primary source.
    try {
      for (const [nativePostId, list] of Object.entries(results)) {
        // Dynamic tree count: dedup by native comment id so a node that
        // appears both nested under `replies` AND flattened at the top level
        // of Ayrshare's payload is counted exactly once.
        const seenIds = new Set<string>();
        let treeCount = 0;
        for (const [idx, node] of (Array.isArray(list) ? (list as any[]) : []).entries()) {
          const cid = pickStr(node?.id, node?.commentId, node?.comment_id, node?.platformCommentId) ?? `__anon_${idx}`;
          if (seenIds.has(cid)) continue;
          seenIds.add(cid);
          treeCount += 1;
        }
        const outer = metricsByPostId.get(nativePostId) ?? { likes: null, shares: null, comments: null };
        // Floor with the locally-persisted engagement_events count so a
        // transient empty Ayrshare payload can never collapse a real count to 0.
        let dbCommentCount = 0;
        try {
          const { count } = await admin
            .from("engagement_events")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("is_archived", false)
            .eq("external_post_id", nativePostId);
          if (typeof count === "number") dbCommentCount = count;
        } catch { /* non-fatal */ }
        // Authoritative total: full walked tree, floored by analytics integer
        // and the persisted DB rows — whichever reflects the most reality.
        const liveComments = Math.max(
          treeCount,
          typeof outer.comments === "number" ? outer.comments : 0,
          dbCommentCount,
        );

        // Resolve every known id alias for this post BEFORE the update so we
        // can also read the previous high-water marks from those same rows.
        const target = targets.get(nativePostId);
        const idAliases = Array.from(new Set([
          nativePostId,
          target?.fetchPostId,
          ...(target?.permalinkAliases ?? []),
          ...requestedPostIds,
        ].map((v) => String(v || "").trim()).filter(Boolean)));

        // High-water marks from existing rows: Ayrshare's /analytics likeCount
        // intermittently regresses to 0/1 while the live FB post clearly has
        // more engagement. Never let a low provider integer overwrite a higher
        // previously-confirmed count.
        let prevLikeHigh = 0;
        let prevShareHigh = 0;
        try {
          const { data: prevRows } = await admin
            .from("campaign_logs")
            .select("like_count, share_count")
            .eq("user_id", userId)
            .in("provider_message_id", idAliases);
          for (const r of prevRows ?? []) {
            prevLikeHigh = Math.max(prevLikeHigh, Number((r as any)?.like_count ?? 0) || 0);
            prevShareHigh = Math.max(prevShareHigh, Number((r as any)?.share_count ?? 0) || 0);
          }
        } catch { /* non-fatal */ }

        const providerLikes = typeof outer.likes === "number" ? outer.likes : null;
        // Safety floor: when the provider returns a suspiciously low like
        // count (0/1) on a post that demonstrably has comments, keep the
        // previous high-water mark instead of regressing the badge.
        const likeSuspicious = providerLikes !== null && providerLikes <= 1 && liveComments > 1;
        const finalLikes = likeSuspicious
          ? Math.max(providerLikes, prevLikeHigh)
          : (providerLikes ?? (forceRefresh ? prevLikeHigh : prevLikeHigh));
        const providerShares = typeof outer.shares === "number" ? outer.shares : null;
        const finalShares = providerShares !== null ? Math.max(providerShares, 0) : prevShareHigh;

        const patch: Record<string, unknown> = {
          comment_count: liveComments,
          like_count: finalLikes,
          share_count: finalShares,
          metrics_updated_at: new Date().toISOString(),
        };
        console.log("[ayrshare-comments-fetch] counters overwrite", {
          stored: nativePostId, treeCount, analyticsComments: outer.comments, dbCommentCount,
          providerLikes, prevLikeHigh, final: { comments: liveComments, likes: finalLikes, shares: finalShares },
        });
        await admin
          .from("campaign_logs")
          .update(patch)
          .eq("user_id", userId)
          .in("provider_message_id", idAliases);
      }
    } catch (countErr) {
      console.warn("[ayrshare-comments-fetch] counters sync failed", countErr);
    }

    // Always return 200 — provider rate-limit (429) / suspended (403) details
    // are surfaced in `api_errors` so the client can render them as soft
    // warnings instead of throwing a runtime error overlay.

    // Hard-stop signal: if Ayrshare returned 429 (rate limited) or 403
    // (suspended profile) on ANY post, surface a top-level `halt` flag so the
    // client can immediately freeze further provider calls. Per Ayrshare
    // support, repeated 429s caused our profile suspensions — never retry.
    const rateLimited = apiErrors.some((e: any) => Number(e?.status) === 429);
    const suspended = apiErrors.some((e: any) => Number(e?.status) === 403);

    return json({
      success: true,
      comments: results,
      errors,
      api_errors: apiErrors,
      mapping_errors: mappingErrors,
      persisted,
      skipped,
      blocked_self: blockedSelf,
      dispatched: toDispatch.length,
      rate_limited: rateLimited,
      suspended,
      halt: rateLimited || suspended,
    }, 200);
  } catch (e) {
    console.error("[ayrshare-comments-fetch] error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

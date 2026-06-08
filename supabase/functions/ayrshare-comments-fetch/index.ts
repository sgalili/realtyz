// Realtyz comments-fetch — pulls live comments per native Facebook post id
// directly from Meta Graph API, bypassing Ayrshare entirely for read paths,
// persists them into engagement_events (dedup by user_id + external_id), and
// dispatches each new comment into auto-engagement-process.
// Strict tenant isolation: user_id is required and scopes every DB query.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveOwnPageIdentity, isSelfAuthoredComment } from "../_shared/ayrshare-helpers.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isUuid = (value: unknown) =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());

const safeMetaPayload = (payload: any, text = "") => ({
  message: payload?.message ?? payload?.error ?? payload?.errors?.[0]?.message ?? text.slice(0, 500) ?? null,
  code: payload?.code ?? payload?.errors?.[0]?.code ?? null,
  raw: payload && Object.keys(payload).length ? payload : text.slice(0, 1000),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  try {
    const FB_PAGE_TOKEN = Deno.env.get("FB_PAGE_ACCESS_TOKEN")?.trim() || null;
    if (!FB_PAGE_TOKEN) return json({ error: "FB_PAGE_ACCESS_TOKEN not configured" }, 500);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

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

    type CommentFetchTarget = { fetchPostId: string; nativePostId: string; platform: string };
    const targets = new Map<string, CommentFetchTarget>();
    requestedPostIds.forEach((id) => {
      const clean = String(id).trim();
      if (clean) targets.set(clean, { fetchPostId: clean, nativePostId: clean, platform: platformHint });
    });

    // Ayrshare's comments endpoint expects the top-level Ayrshare post id
    // (provider_response.posts[].id), while our UI/database match comments by
    // the native social post id (campaign_logs.provider_message_id / postIds[].id).
    // Resolve both, strictly scoped to this workspace owner.
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

      const requested = new Set(requestedPostIds.map((id) => String(id).trim()).filter(Boolean));
      for (const row of campaigns ?? []) {
        const response: any = (row as any).provider_response ?? {};
        const wrappedPosts: any[] = Array.isArray(response?.posts) ? response.posts : [];
        const flatPosts: any[] = response?.id ? [response] : [];
        for (const post of [...flatPosts, ...wrappedPosts]) {
          const topId = typeof post?.id === "string" ? post.id.trim() : "";
          const postIds = Array.isArray(post?.postIds) ? post.postIds : [];
          const nativeForPlatform =
            postIds.find((p: any) => String(p?.platform || "").toLowerCase() === platformHint)?.id ??
            postIds[0]?.id ??
            (row as any).provider_message_id ??
            null;
          const nativeId = typeof nativeForPlatform === "string" ? nativeForPlatform.trim() : "";
          const aliases = [topId, nativeId, (row as any).provider_message_id].map((v) => String(v || "").trim()).filter(Boolean);
          if (!topId || !aliases.some((alias) => requested.has(alias))) continue;
          const platform = String((postIds.find((p: any) => String(p?.id || "") === nativeId)?.platform || (row as any).channel || platformHint)).toLowerCase();
          const key = nativeId || topId;
          targets.set(key, { fetchPostId: topId, nativePostId: key, platform: platform || platformHint });
        }
      }
    } catch (lookupErr) {
      console.error("[ayrshare-comments-fetch] campaign lookup threw", lookupErr instanceof Error ? lookupErr.message : String(lookupErr));
    }

    const workspaceProfile = await resolveWorkspaceProfileKey(admin);
    const envProfileKey = typeof Deno.env.get("AYRSHARE_PROFILE_KEY") === "string"
      ? Deno.env.get("AYRSHARE_PROFILE_KEY")!.trim().replace(/^[`'\"]+|[`'\"]+$/g, "")
      : "";
    const profileCandidates = [
      workspaceProfile.profileKey ? { profileKey: workspaceProfile.profileKey, refId: workspaceProfile.refId, source: "workspace" } : null,
      envProfileKey && envProfileKey !== workspaceProfile.profileKey ? { profileKey: envProfileKey, refId: "env-fallback", source: "env" } : null,
      // Rescue path: older posts may have been published on the primary Ayrshare
      // profile. In that case sending the currently saved (suspended) Profile-Key
      // makes every comment request fail with 403, while the primary API key can
      // still read the post comments without any Profile-Key header.
      { profileKey: "", refId: "primary", source: "primary" },
    ].filter(Boolean) as Array<{ profileKey: string; refId: string | null; source: string }>;
    if (profileCandidates.length === 0) {
      return json({ error: "workspace ayrshare profile key missing" }, 400);
    }
    const defaultProfileKey = profileCandidates[0].profileKey;
    let refId = profileCandidates[0].refId;
    const ownPage = await resolveOwnPageIdentity(admin);

    const pickStr = (...vals: unknown[]) => {
      for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
      return null;
    };
    const pickText = (item: any): string | null =>
      pickStr(item?.comment, item?.text, item?.message, item?.commentString, item?.textContent, item?.body);
    const resolveFacebookAvatar = async (senderId: string | null, platform: string): Promise<string | null> => {
      if (!senderId || !FB_PAGE_TOKEN || !/facebook/i.test(platform)) return null;
      try {
        const tokenParam = `access_token=${encodeURIComponent(FB_PAGE_TOKEN)}`;
        const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(senderId)}/picture?type=square&redirect=false&${tokenParam}`;
        const res = await fetch(url);
        const json = await res.json().catch(() => ({}));
        const cdnUrl = res.ok && typeof json?.data?.url === "string" ? json.data.url : null;
        console.log("[ayrshare-comments-fetch] avatar resolve", { senderId, status: res.status, ok: !!cdnUrl, host: cdnUrl ? new URL(cdnUrl).host : null });
        return cdnUrl;
      } catch (avatarErr) {
        console.warn("[ayrshare-comments-fetch] facebook avatar resolve failed", senderId, avatarErr instanceof Error ? avatarErr.message : String(avatarErr));
        return null;
      }
    };

    const results: Record<string, any[]> = {};
    const errors: Record<string, string> = {};
    const apiErrors: any[] = [];
    const mappingErrors: any[] = [];

    const extractComments = (payload: any, platform: string): any[] => {
      const platformNode = payload?.[platform];
      const candidates = [
        payload,
        payload?.comments,
        payload?.data?.comments,
        payload?.data,
        platformNode,
        platformNode?.comments,
        platformNode?.data,
      ];
      for (const candidate of candidates) {
        if (Array.isArray(candidate)) return candidate;
      }
      return [];
    };

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

    const mergeChildComments = (targetNode: any, children: any[]) => {
      if (!targetNode || !Array.isArray(children) || children.length === 0) return;
      const existing = new Set(extractChildComments(targetNode).map((child: any) => pickStr(child?.id, child?.commentId, child?.comment_id)).filter(Boolean));
      const merged = [...(Array.isArray(targetNode.comments) ? targetNode.comments : [])];
      for (const child of children) {
        const id = pickStr(child?.id, child?.commentId, child?.comment_id);
        if (id && existing.has(id)) continue;
        merged.push(child);
        if (id) existing.add(id);
      }
      targetNode.comments = merged;
    };

    const fetchComments = async (target: CommentFetchTarget, useSocialId: boolean, candidateProfileKey = defaultProfileKey) => {
      const id = useSocialId ? target.nativePostId : target.fetchPostId;
      // Ask Ayrshare to inline reply threads so nested child nodes (e.g. Shi
      // Galili replying to Udi) come back in the same payload. Different
      // Ayrshare plans honor different flag names — we send all known
      // aliases; ignored params are harmless.
      const base = `limit=100&includeReplies=true&include_replies=true&replies=true&expandReplies=true&depth=5`;
      const qs = useSocialId
        ? `${base}&platform=${encodeURIComponent(target.platform)}&searchPlatformId=true`
        : base;
      const headers: Record<string, string> = {
          Authorization: `Bearer ${AYRSHARE_API_KEY}`,
          "Content-Type": "application/json",
      };
      if (candidateProfileKey) headers["Profile-Key"] = candidateProfileKey;
      const r = await fetch(`${AYR_BASE}/comments/${encodeURIComponent(id)}?${qs}`, {
        headers,
      });
      const text = await r.text();
      let payload: any = {};
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
      return { ok: r.ok, status: r.status, payload, text };
    };

    await Promise.all(
      Array.from(targets.values()).map(async (target) => {
        const { fetchPostId, nativePostId, platform } = target;
        let activeProfileKey = defaultProfileKey;
        let activeRefId = refId;
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

          // FAST PATH: Meta Graph API direct fetch for Facebook posts.
          // Ayrshare may store a composite id whose page-prefix doesn't match
          // the page bound to FB_PAGE_TOKEN (the original failure mode that
          // returned "Object does not exist"). We try several id shapes plus a
          // feed-enumeration fallback so live comments always surface.
          let graphArr: any[] | null = null;
          let resolvedGraphPostId: string | null = null;
          if (FB_PAGE_TOKEN && /^facebook$/i.test(platform)) {
            const suffix = nativePostId.includes("_") ? nativePostId.split("_").pop()! : nativePostId;
            const pageIds = new Set<string>();
            const candidates: string[] = [];
            const graphTokens = new Map<string, { token: string; label: string; pageId?: string }>();
            const pushUnique = (v: string) => { if (v && !candidates.includes(v)) candidates.push(v); };
            const pushPageId = (v: unknown) => {
              const id = typeof v === "string" ? v.trim() : "";
              if (/^\d+$/.test(id)) pageIds.add(id);
            };
            const addGraphToken = (token: unknown, label: string, pageId?: string) => {
              const clean = typeof token === "string" ? token.trim() : "";
              if (!clean || graphTokens.has(clean)) return;
              graphTokens.set(clean, { token: clean, label, pageId });
            };
            if (/^\d+_\d+$/.test(nativePostId)) {
              pushUnique(nativePostId);
              pushPageId(nativePostId.split("_")[0]);
            }
            if (/^\d+$/.test(suffix)) pushUnique(suffix);
            pushPageId(ownPage.pageId);
            addGraphToken(FB_PAGE_TOKEN, "configured");

            // The saved secret is sometimes a user token rather than the Page
            // token. In that case /me/accounts exposes the actual Page access
            // token that can read the post's comments.
            try {
              const tokenParam = `access_token=${encodeURIComponent(FB_PAGE_TOKEN)}`;
              const meRes = await fetch(`https://graph.facebook.com/v20.0/me?fields=id,name,accounts.limit(100){id,name,access_token}&${tokenParam}`);
              const meJson = await meRes.json().catch(() => ({}));
              if (meRes.ok && meJson?.id) pushPageId(String(meJson.id));
              const accounts = Array.isArray(meJson?.accounts?.data) ? meJson.accounts.data : [];
              for (const account of accounts) {
                const accountId = typeof account?.id === "string" ? account.id.trim() : "";
                pushPageId(accountId);
                addGraphToken(account?.access_token, `page:${accountId}`, accountId);
              }
            } catch (meErr) {
              console.warn("[ayrshare-comments-fetch] graph /me/accounts failed", meErr instanceof Error ? meErr.message : String(meErr));
            }

            // Public Facebook URLs can redirect to a canonical Page id that is
            // different from the originally stored id. Discover it and add it
            // as another candidate before giving up.
            if (/^\d+$/.test(suffix)) {
              try {
                const sourcePage = nativePostId.includes("_") ? nativePostId.split("_")[0] : ownPage.pageId;
                const publicUrl = sourcePage
                  ? `https://www.facebook.com/${encodeURIComponent(sourcePage)}/posts/${encodeURIComponent(suffix)}`
                  : `https://www.facebook.com/${encodeURIComponent(suffix)}`;
                const publicRes = await fetch(publicUrl, {
                  headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "he-IL,he;q=0.9,en;q=0.8" },
                  redirect: "follow",
                });
                const publicText = await publicRes.text().catch(() => "");
                const haystack = `${publicRes.url}\n${publicText.slice(0, 20000)}`;
                const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const canonical = haystack.match(new RegExp(`facebook\\.com/(\\d+)/posts/[^\"]*?/${escapedSuffix}/?`, "i"))
                  ?? haystack.match(new RegExp(`facebook\\.com/(\\d+)/posts/${escapedSuffix}/?`, "i"));
                if (canonical?.[1]) pushPageId(canonical[1]);
              } catch (publicErr) {
                console.warn("[ayrshare-comments-fetch] graph canonical page discovery failed", publicErr instanceof Error ? publicErr.message : String(publicErr));
              }
            }
            for (const pageId of pageIds) if (/^\d+$/.test(suffix)) pushUnique(`${pageId}_${suffix}`);

            const tryFetch = async (postId: string, token: string): Promise<any[] | null> => {
              const tokenParam = `access_token=${encodeURIComponent(token)}`;
              const fields = "id,message,created_time,from{id,name,picture{url}},parent,like_count,comments.limit(100){id,message,created_time,from{id,name,picture{url}},parent,like_count,comments.limit(100){id,message,created_time,from{id,name,picture{url}},parent,like_count}}";
              const gUrl = `https://graph.facebook.com/v20.0/${encodeURIComponent(postId)}/comments?fields=${encodeURIComponent(fields)}&limit=100&filter=stream&${tokenParam}`;
              const gRes = await fetch(gUrl);
              const gJson = await gRes.json().catch(() => ({}));
              if (gRes.ok && Array.isArray(gJson?.data)) return gJson.data;
              console.warn("[ayrshare-comments-fetch] graph candidate failed", postId, gRes.status, JSON.stringify(gJson).slice(0, 200));
              return null;
            };

            // Explicit per-comment replies fetch. FB Graph's nested field
            // expansion is unreliable past depth 1 — some replies only
            // surface via the comment's own /COMMENT_ID/comments edge.
            const fetchRepliesFor = async (commentId: string, token: string): Promise<any[]> => {
              try {
                const tokenParam = `access_token=${encodeURIComponent(token)}`;
                const replyFields = "id,message,created_time,from{id,name,picture{url}},parent,like_count";
                const rUrl = `https://graph.facebook.com/v20.0/${encodeURIComponent(commentId)}/comments?fields=${encodeURIComponent(replyFields)}&limit=100&filter=stream&${tokenParam}`;
                const rRes = await fetch(rUrl);
                const rJson = await rRes.json().catch(() => ({}));
                if (rRes.ok && Array.isArray(rJson?.data)) return rJson.data;
              } catch (e) {
                console.warn("[ayrshare-comments-fetch] replies fetch failed", commentId, e instanceof Error ? e.message : String(e));
              }
              return [];
            };

            const normalizeOne = (c: any, parentIdFallback: string | null = null): any => {
              const from = c.from
                ? { ...c.from, picture: c.from?.picture?.url ? { data: { url: c.from.picture.url } } : c.from?.picture }
                : { name: "משתמש פייסבוק" };
              return {
                id: c.id,
                message: c.message ?? "",
                created_time: c.created_time,
                like_count: c.like_count ?? 0,
                from,
                __parent_id: c.parent?.id ?? parentIdFallback,
                comments: Array.isArray(c?.comments?.data) ? c.comments.data.map((k: any) => normalizeOne(k, c.id)) : [],
              };
            };
            const normalize = (data: any[]) => data.map((c) => normalizeOne(c, null));

            let activeGraphToken = FB_PAGE_TOKEN;
            const tokenCandidates = Array.from(graphTokens.values()).sort((a, b) => {
              const aPageMatch = a.pageId && pageIds.has(a.pageId) ? 0 : 1;
              const bPageMatch = b.pageId && pageIds.has(b.pageId) ? 0 : 1;
              if (aPageMatch !== bPageMatch) return aPageMatch - bPageMatch;
              return a.label === "configured" ? 1 : b.label === "configured" ? -1 : 0;
            });
            for (const tokenCandidate of tokenCandidates) {
              for (const cand of candidates) {
                const data = await tryFetch(cand, tokenCandidate.token);
                if (data) {
                  activeGraphToken = tokenCandidate.token;
                  resolvedGraphPostId = cand;
                  graphArr = normalize(data);
                  break;
                }
              }
              if (graphArr) break;
            }

            // For every root comment, explicitly hydrate its replies edge
            // and merge any reply not already present under .comments.
            if (graphArr) {
              await Promise.all(graphArr.map(async (root: any) => {
                const fetched = await fetchRepliesFor(root.id, activeGraphToken);
                if (!fetched.length) return;
                const existingIds = new Set((root.comments || []).map((k: any) => k.id));
                const merged = [...(root.comments || [])];
                for (const reply of fetched) {
                  if (existingIds.has(reply.id)) continue;
                  const normalized = normalizeOne(reply, root.id);
                  // Hydrate one more level (replies-of-reply) for depth 2 threads.
                  const grand = await fetchRepliesFor(reply.id, activeGraphToken);
                  if (grand.length) {
                    normalized.comments = grand.map((g: any) => normalizeOne(g, reply.id));
                  }
                  merged.push(normalized);
                  existingIds.add(reply.id);
                }
                root.comments = merged;
              }));
            }

            // Last-resort: enumerate discovered Page feeds and match by suffix or body.
            if (!graphArr) {
              const probe = String(body?.campaign_body || "").trim().slice(0, 50);
              outer: for (const tokenCandidate of tokenCandidates) {
                for (const pageId of pageIds) {
                  try {
                    const tokenParam = `access_token=${encodeURIComponent(tokenCandidate.token)}`;
                    const feedRes = await fetch(`https://graph.facebook.com/v20.0/${pageId}/posts?fields=id,message,created_time&limit=25&${tokenParam}`);
                    const feedJson = await feedRes.json().catch(() => ({}));
                    const feedArr: any[] = Array.isArray(feedJson?.data) ? feedJson.data : [];
                    let match = feedArr.find((p) => String(p?.id || "").endsWith(`_${suffix}`));
                    if (!match && probe) match = feedArr.find((p) => String(p?.message || "").includes(probe));
                    if (match?.id) {
                      const data = await tryFetch(match.id, tokenCandidate.token);
                      if (data) {
                        activeGraphToken = tokenCandidate.token;
                        resolvedGraphPostId = match.id;
                        graphArr = normalize(data);
                        break outer;
                      }
                    }
                  } catch (feedErr) {
                    console.warn("[ayrshare-comments-fetch] graph feed enum failed", pageId, feedErr instanceof Error ? feedErr.message : String(feedErr));
                  }
                }
              }
            }

            if (graphArr) {
              console.log("[ayrshare-comments-fetch] graph fast-path success", { stored: nativePostId, resolved: resolvedGraphPostId, count: graphArr.length });
            }
          }

          let fetched: any = graphArr ? { ok: true, status: 200, payload: { data: graphArr }, text: "" } : null;
          let arr: any[] = graphArr ?? [];

          // Try the saved workspace profile first, then the legacy env profile
          // key as a rescue path. This prevents a suspended replacement profile
          // from blanking comments for posts created under the original profile.
          if (!graphArr) {
            let best: { fetched: any; arr: any[]; profileKey: string; refId: string | null } | null = null;
            for (const candidate of profileCandidates) {
              let candidateFetched = await fetchComments(target, false, candidate.profileKey);
              let candidateArr = candidateFetched.ok ? extractComments(candidateFetched.payload, platform) : [];

              // If Ayrshare's top-level id route is empty/unavailable, retry with
              // the native platform id. The UI still stores/matches the native id.
              if ((candidateArr.length === 0 || !candidateFetched.ok) && fetchPostId !== nativePostId) {
                const socialFetched = await fetchComments(target, true, candidate.profileKey);
                const socialArr = socialFetched.ok ? extractComments(socialFetched.payload, platform) : [];
                if (socialFetched.ok || socialArr.length > 0) {
                  candidateFetched = socialFetched;
                  candidateArr = socialArr;
                }
              }

              if (!best || candidateArr.length > best.arr.length || (candidateFetched.ok && !best.fetched.ok)) {
                best = { fetched: candidateFetched, arr: candidateArr, profileKey: candidate.profileKey, refId: candidate.refId };
              }
              if (candidateArr.length > 0) break;
            }
            fetched = best?.fetched ?? { ok: false, status: 500, payload: { message: "No Ayrshare profile attempted" }, text: "" };
            arr = best?.arr ?? [];
            activeProfileKey = best?.profileKey ?? defaultProfileKey;
            activeRefId = best?.refId ?? refId;
          }

          if (!fetched.ok) {
            const apiError = {
              post_id: nativePostId,
              fetch_post_id: fetchPostId,
              platform,
              status: fetched.status,
              payload: safeAyrPayload(fetched.payload, fetched.text),
            };
            apiErrors.push(apiError);
            console.error("[ayrshare-comments-fetch] Ayrshare API rejected request", apiError);
            errors[nativePostId] = `HTTP ${fetched.status}: ${apiError.payload.message ?? "Ayrshare comments rejected request"}`;
            results[nativePostId] = [];
            return;
          }

          // Ayrshare's post comments endpoint often returns only the first
          // visible layer. For Facebook comment threads, hydrate each returned
          // social comment via `commentId=true` so native replies such as
          // "Shay replied under Udi's reply" are physically attached to their
          // parent before flattening/persisting. Keep this scoped to a single
          // card-level fetch to avoid provider rate-limit storms from cron sync.
          if (!graphArr && arr.length > 0 && requestedPostIds.length <= 5) {
            const rootsToHydrate = arr.slice(0, 50);
            await Promise.all(rootsToHydrate.map(async (root) => {
              const commentId = pickStr(root?.id, root?.commentId, root?.comment_id, root?.platformCommentId);
              if (!commentId) return;
              try {
                const detailQs = `platform=${encodeURIComponent(platform)}&searchPlatformId=true&commentId=true&limit=100&includeReplies=true&include_replies=true&replies=true&expandReplies=true&depth=5`;
                const detailHeaders: Record<string, string> = {
                    Authorization: `Bearer ${AYRSHARE_API_KEY}`,
                    "Content-Type": "application/json",
                };
                if (activeProfileKey) detailHeaders["Profile-Key"] = activeProfileKey;
                const detailRes = await fetch(`${AYR_BASE}/comments/${encodeURIComponent(commentId)}?${detailQs}`, {
                  headers: detailHeaders,
                });
                if (!detailRes.ok) return;
                const detailPayload = await detailRes.json().catch(() => ({}));
                const platformNode = detailPayload?.[platform];
                const detailNode = Array.isArray(platformNode)
                  ? platformNode[0]
                  : Array.isArray(detailPayload?.data)
                  ? detailPayload.data[0]
                  : detailPayload?.data ?? platformNode ?? detailPayload;
                mergeChildComments(root, extractChildComments(detailNode));
              } catch (detailErr) {
                console.warn("[ayrshare-comments-fetch] comment detail hydration failed", commentId, detailErr instanceof Error ? detailErr.message : String(detailErr));
              }
            }));
          }

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
          for (const c of arr) walk(c, (c as any)?.__parent_id ?? null);
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
        // Try to capture an author profile image from the various shapes
        // Ayrshare/FB/IG return. For Facebook we ALWAYS prefer the resolved
        // CDN URL from the Page-token /picture?redirect=false call — the raw
        // from.picture.data.url returned by FB Graph embeds an access_token
        // that is short-lived and frequently blocked from the browser. Other
        // platforms fall back to whatever the payload exposes.
        const isFb = /facebook/i.test(platformHint);
        const fbResolved = isFb ? await resolveFacebookAvatar(senderId, platformHint) : null;
        const pictureFromPayload =
          c?.from?.picture?.data?.url ??
          c?.from?.picture_url ??
          c?.from?.profile_picture_url ??
          c?.user?.profile_picture_url ??
          c?.user?.picture?.data?.url ??
          c?.author?.profile_image ??
          c?.profile_image ??
          c?.profile_picture_url ??
          c?.avatar ??
          null;
        // Token-free public fallback — Facebook's /picture endpoint resolves
        // for any public user/page without auth when called with redirect=true
        // (default). Browsers can hit it directly. Used only when no resolved
        // CDN URL and no payload-provided URL exists.
        const fbPublicFallback = isFb && senderId
          ? `https://graph.facebook.com/v20.0/${encodeURIComponent(senderId)}/picture?type=square`
          : null;
        // Prefer the clean CDN URL on Facebook; otherwise use payload-provided;
        // last-resort = public unauthenticated graph picture URL.
        const authorPicture = fbResolved ?? pictureFromPayload ?? fbPublicFallback ?? null;


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
          const currentProfileImage = typeof currentAuthor.profile_image === "string" ? currentAuthor.profile_image : null;
          // If we resolved a fresh CDN URL, overwrite stale token-bearing URLs.
          const nextProfileImage = safeStr(authorPicture, 1000) ?? currentProfileImage ?? null;
          const nextMetadata = {
            ...currentMeta,
            parent_id: safeStr(parentId) ?? currentMeta.parent_id ?? null,
            self_authored: selfAuthored || currentMeta.self_authored === true,
            author_type: selfAuthored ? "workspace_page" : currentMeta.author_type ?? "audience",
            sender_id: safeStr(senderId) ?? currentMeta.sender_id ?? null,
            profile_image: nextProfileImage,
            sender_avatar_url: nextProfileImage,
            author: {
              ...currentAuthor,
              name: safeStr(sender, 200) ?? currentAuthor.name ?? null,
              profile_image: nextProfileImage,
            },
          };
          if (JSON.stringify(nextMetadata) !== JSON.stringify(currentMeta)) {
            await admin.from("engagement_events").update({ metadata: nextMetadata }).eq("id", exists.id).eq("user_id", userId);
          }
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

        // Sanitize: keep ONLY flat scalar fields in metadata. The raw Ayrshare
        // payload can contain deeply nested objects (replies trees, user blobs,
        // attachment arrays) that occasionally violate jsonb size/shape
        // constraints and cause the insert to fail silently.
        const cleanMetadata = {
          source: "ayrshare_comments_fetch",
          campaign_name: safeStr(campaignName),
          profile_ref_id: safeStr(c?.__profile_ref_id ?? refId),
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
          // Upsert on (user_id, external_id) — partial unique index guards
          // against the duplicate-insert loop that previously created hundreds
          // of copies of the same FB reply when maybeSingle() silently failed.
          const { error: insErr } = await admin
            .from("engagement_events")
            .upsert(payload, { onConflict: "user_id,external_id", ignoreDuplicates: true });
          if (insErr) {
            console.error(
              "[ayrshare-comments-fetch] upsert failed",
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
            "[ayrshare-comments-fetch] upsert threw",
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

    // Always return 200 — provider rate-limit (429) / suspended (403) details
    // are surfaced in `api_errors` so the client can render them as soft
    // warnings instead of throwing a runtime error overlay.
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
    }, 200);
  } catch (e) {
    console.error("[ayrshare-comments-fetch] error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

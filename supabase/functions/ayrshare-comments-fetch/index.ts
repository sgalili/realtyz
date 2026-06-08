// Realtyz comments-fetch — pulls live comments per post_id from Ayrshare,
// persists them into engagement_events (dedup by user_id + external_id), and
// dispatches each new comment into auto-engagement-process.
// Strict tenant isolation: user_id is required and scopes every DB query.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { AYR_BASE, resolveWorkspaceProfileKey, resolveOwnPageIdentity, isSelfAuthoredComment } from "../_shared/ayrshare-helpers.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isUuid = (value: unknown) =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());

const safeAyrPayload = (payload: any, text = "") => ({
  message: payload?.message ?? payload?.error ?? payload?.errors?.[0]?.message ?? text.slice(0, 500) ?? null,
  code: payload?.code ?? payload?.errors?.[0]?.code ?? null,
  raw: payload && Object.keys(payload).length ? payload : text.slice(0, 1000),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  try {
    const AYRSHARE_API_KEY = Deno.env.get("AYRSHARE_API_KEY");
    if (!AYRSHARE_API_KEY) return json({ error: "AYRSHARE_API_KEY not configured" }, 500);
    const FB_PAGE_TOKEN = Deno.env.get("FB_PAGE_ACCESS_TOKEN")?.trim() || null;

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

    const { profileKey, refId } = await resolveWorkspaceProfileKey(admin);
    if (!profileKey) {
      return json({ error: "workspace ayrshare profile key missing" }, 400);
    }
    const ownPage = await resolveOwnPageIdentity(admin);

    const pickStr = (...vals: unknown[]) => {
      for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
      return null;
    };
    const pickText = (item: any): string | null =>
      pickStr(item?.comment, item?.text, item?.message, item?.commentString, item?.textContent, item?.body);

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

    const fetchComments = async (target: CommentFetchTarget, useSocialId: boolean) => {
      const id = useSocialId ? target.nativePostId : target.fetchPostId;
      // Ask Ayrshare to inline reply threads so nested child nodes (e.g. Shi
      // Galili replying to Udi) come back in the same payload. Different
      // Ayrshare plans honor different flag names — we send all known
      // aliases; ignored params are harmless.
      const base = `limit=100&includeReplies=true&include_replies=true&replies=true&expandReplies=true&depth=5`;
      const qs = useSocialId
        ? `${base}&platform=${encodeURIComponent(target.platform)}&searchPlatformId=true`
        : base;
      const r = await fetch(`${AYR_BASE}/comments/${encodeURIComponent(id)}?${qs}`, {
        headers: {
          Authorization: `Bearer ${AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey,
          "Content-Type": "application/json",
        },
      });
      const text = await r.text();
      let payload: any = {};
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
      return { ok: r.ok, status: r.status, payload, text };
    };

    await Promise.all(
      Array.from(targets.values()).map(async (target) => {
        const { fetchPostId, nativePostId, platform } = target;
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
            const tokenParam = `access_token=${encodeURIComponent(FB_PAGE_TOKEN)}`;
            const suffix = nativePostId.includes("_") ? nativePostId.split("_").pop()! : nativePostId;
            const candidates: string[] = [];
            const pushUnique = (v: string) => { if (v && !candidates.includes(v)) candidates.push(v); };
            if (/^\d+_\d+$/.test(nativePostId)) pushUnique(nativePostId);
            if (/^\d+$/.test(suffix)) pushUnique(suffix);

            let realPageId: string | null = null;
            try {
              const meRes = await fetch(`https://graph.facebook.com/v20.0/me?fields=id,name&${tokenParam}`);
              const meJson = await meRes.json().catch(() => ({}));
              if (meRes.ok && meJson?.id) {
                realPageId = String(meJson.id);
                if (/^\d+$/.test(suffix)) pushUnique(`${realPageId}_${suffix}`);
              }
            } catch (meErr) {
              console.warn("[ayrshare-comments-fetch] graph /me failed", meErr instanceof Error ? meErr.message : String(meErr));
            }

            const tryFetch = async (postId: string): Promise<any[] | null> => {
              const gUrl = `https://graph.facebook.com/v20.0/${encodeURIComponent(postId)}/comments?fields=id,message,created_time,from{id,name,picture{url}},parent,like_count&limit=100&${tokenParam}`;
              const gRes = await fetch(gUrl);
              const gJson = await gRes.json().catch(() => ({}));
              if (gRes.ok && Array.isArray(gJson?.data)) return gJson.data;
              console.warn("[ayrshare-comments-fetch] graph candidate failed", postId, gRes.status, JSON.stringify(gJson).slice(0, 200));
              return null;
            };

            const normalize = (data: any[]) => data.map((c: any) => ({
              id: c.id,
              message: c.message ?? "",
              created_time: c.created_time,
              like_count: c.like_count ?? 0,
              from: c.from ?? { name: "משתמש פייסבוק" },
              __parent_id: c.parent?.id ?? null,
            }));

            for (const cand of candidates) {
              const data = await tryFetch(cand);
              if (data) { resolvedGraphPostId = cand; graphArr = normalize(data); break; }
            }

            // Last-resort: enumerate the Page feed and match by suffix or body.
            if (!graphArr && realPageId) {
              try {
                const feedRes = await fetch(`https://graph.facebook.com/v20.0/${realPageId}/posts?fields=id,message,created_time&limit=25&${tokenParam}`);
                const feedJson = await feedRes.json().catch(() => ({}));
                const feedArr: any[] = Array.isArray(feedJson?.data) ? feedJson.data : [];
                let match = feedArr.find((p) => String(p?.id || "").endsWith(`_${suffix}`));
                if (!match) {
                  const probe = String(body?.campaign_body || "").trim().slice(0, 50);
                  if (probe) match = feedArr.find((p) => String(p?.message || "").includes(probe));
                }
                if (match?.id) {
                  const data = await tryFetch(match.id);
                  if (data) { resolvedGraphPostId = match.id; graphArr = normalize(data); }
                }
              } catch (feedErr) {
                console.warn("[ayrshare-comments-fetch] graph feed enum failed", feedErr instanceof Error ? feedErr.message : String(feedErr));
              }
            }

            if (graphArr) {
              console.log("[ayrshare-comments-fetch] graph fast-path success", { stored: nativePostId, resolved: resolvedGraphPostId, count: graphArr.length });
            }
          }

          let fetched = graphArr ? { ok: true, status: 200, payload: { data: graphArr }, text: "" } : await fetchComments(target, false);
          let arr: any[] = graphArr ?? (fetched.ok ? extractComments(fetched.payload, platform) : []);

          // If Ayrshare's top-level id route is empty/unavailable, retry with
          // the native platform id. The UI still stores/matches the native id.
          if (!graphArr && (arr.length === 0 || !fetched.ok) && fetchPostId !== nativePostId) {
            const socialFetched = await fetchComments(target, true);
            const socialArr = socialFetched.ok ? extractComments(socialFetched.payload, platform) : [];
            if (socialFetched.ok || socialArr.length > 0) {
              fetched = socialFetched;
              arr = socialArr;
            }
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
            flat.push(node);
            const kids = [
              ...(Array.isArray(node.replies) ? node.replies : []),
              ...(Array.isArray(node.children) ? node.children : []),
              ...(Array.isArray(node.comments) ? node.comments : []),
              ...(Array.isArray(node.thread) ? node.thread : []),
              ...(Array.isArray(node?.replies?.data) ? node.replies.data : []),
              ...(Array.isArray(node?.comments?.data) ? node.comments.data : []),
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
        // SENDER FIREWALL: never ingest comments authored by our own Page,
        // by Ayrshare on our behalf, or carrying our system reply signature.
        if (isSelfAuthoredComment({
          fromId: senderId,
          fromName: sender,
          text,
          ownPageId: ownPage.pageId,
          ownPageName: ownPage.pageName,
        })) {
          blockedSelf += 1;
          console.log("[ayrshare-comments-fetch] blocked self-authored comment", { nativeId, senderId, sender });
          continue;
        }
        const parentId = typeof c?.__parent_id === "string" ? c.__parent_id : null;

        const { data: exists } = await admin
          .from("engagement_events")
          .select("id, status, ai_reply_text")
          .eq("user_id", userId)
          .eq("external_id", nativeId)
          .maybeSingle();

        if (exists?.id) {
          skipped += 1;
          // Re-dispatch only if still pending and no reply yet.
          if (!exists.ai_reply_text && exists.status !== "sent" && exists.status !== "pending_approval") {
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
        const safeStr = (v: unknown, max = 500): string | null => {
          if (v === null || v === undefined) return null;
          const s = typeof v === "string" ? v : (() => {
            try { return JSON.stringify(v); } catch { return String(v); }
          })();
          const trimmed = s.trim();
          return trimmed ? trimmed.slice(0, max) : null;
        };
        // Try to capture an author profile image from the various shapes
        // Ayrshare/FB/IG return. FB Graph nests it under from.picture.data.url;
        // IG returns user.profile_picture_url; some channels expose a flat
        // profile_image/avatar. As a last-resort for Facebook we fall back to
        // the public graph picture redirect using the author id.
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
        const fbFallbackPicture =
          !pictureFromPayload && senderId && /facebook/i.test(platformHint)
            ? (FB_PAGE_TOKEN
              ? `https://graph.facebook.com/v20.0/${senderId}/picture?type=square&access_token=${encodeURIComponent(FB_PAGE_TOKEN)}`
              : `https://graph.facebook.com/v20.0/${senderId}/picture?type=square`)
            : null;
        const authorPicture = pictureFromPayload ?? fbFallbackPicture;

        const cleanMetadata = {
          source: "ayrshare_comments_fetch",
          campaign_name: safeStr(campaignName),
          profile_ref_id: safeStr(refId),
          parent_id: safeStr(parentId),
          native_created_at: safeStr(c?.created_time ?? c?.createdAt ?? c?.created_at ?? c?.timestamp),
          like_count: typeof c?.like_count === "number" ? c.like_count : null,
          permalink: safeStr(c?.permalink ?? c?.permalink_url ?? c?.url, 1000),
          sender_id: safeStr(senderId),
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
          status: "pending",
          ai_action: "queued",
          metadata: cleanMetadata,
        };

        try {
          const { error: insErr } = await admin.from("engagement_events").insert(payload);
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
        toDispatch.push({
          external_id: nativeId,
          external_post_id: postId,
          sender_handle: cleanSender,
          sender_id: senderId,
          inbound_text: cleanText,
          platform: platformHint,
          parent_id: parentId,
        });

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

    const status = persisted === 0 && skipped === 0 && (apiErrors.length || mappingErrors.length)
      ? Number(apiErrors[0]?.status || 502)
      : 200;

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
    }, status);
  } catch (e) {
    console.error("[ayrshare-comments-fetch] error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

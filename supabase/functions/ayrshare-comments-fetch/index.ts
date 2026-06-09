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
    // Optional: used only for higher-quality Facebook avatar resolution.
    const FB_PAGE_TOKEN = Deno.env.get("FB_PAGE_ACCESS_TOKEN")?.trim() || null;

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

    const normalizeMetaPostCandidates = (nativePostId: string, fetchPostId: string) => {
      const ids: string[] = [];
      const push = (value: unknown) => {
        const id = typeof value === "string" ? value.trim() : "";
        if (id && !ids.includes(id)) ids.push(id);
      };
      push(nativePostId);
      push(fetchPostId);
      const suffix = nativePostId.includes("_") ? nativePostId.split("_").pop()! : nativePostId;
      if (/^\d+$/.test(suffix)) {
        push(suffix);
        if (ownPage.pageId) push(`${ownPage.pageId}_${suffix}`);
      }
      return ids;
    };

    const fetchMetaComments = async (postId: string) => {
      const fields = "id,message,created_time,from{id,name,picture{url}},parent,replies{id,message,created_time,from{id,name,picture{url}}}";
      const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(postId)}/comments?fields=${encodeURIComponent(fields)}&limit=100&access_token=${encodeURIComponent(FB_PAGE_TOKEN)}`;
      const res = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
      const text = await res.text();
      let payload: any = {};
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = { rawText: text }; }
      return { ok: res.ok, status: res.status, payload, text };
    };

    const normalizeGraphNode = (node: any, parentId: string | null = null): any => {
      const from = node?.from
        ? { ...node.from, picture: node.from?.picture?.url ? { data: { url: node.from.picture.url } } : node.from?.picture }
        : { name: "משתמש פייסבוק" };
      const replies = Array.isArray(node?.replies?.data) ? node.replies.data : [];
      return {
        id: node?.id,
        message: node?.message ?? "",
        created_time: node?.created_time,
        from,
        __parent_id: node?.parent?.id ?? parentId,
        comments: replies.map((reply: any) => normalizeGraphNode(reply, node?.id ?? parentId)),
      };
    };

    const fetchDirectMetaTree = async (target: CommentFetchTarget) => {
      const attempts: any[] = [];
      for (const candidate of normalizeMetaPostCandidates(target.nativePostId, target.fetchPostId)) {
        const fetched = await fetchMetaComments(candidate);
        if (fetched.ok && Array.isArray(fetched.payload?.data)) {
          return {
            ok: true,
            status: fetched.status,
            resolvedPostId: candidate,
            comments: fetched.payload.data.map((node: any) => normalizeGraphNode(node, null)),
            attempts,
          };
        }
        attempts.push({ post_id: candidate, status: fetched.status, payload: safeMetaPayload(fetched.payload, fetched.text) });
      }
      return { ok: false, status: attempts[attempts.length - 1]?.status ?? 500, resolvedPostId: null, comments: [], attempts };
    };

    await Promise.all(
      Array.from(targets.values()).map(async (target) => {
        const { fetchPostId, nativePostId, platform } = target;
        const activeRefId = "meta_graph_direct";
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
            errors[nativePostId] = "direct_meta_comments_only_supports_facebook";
            results[nativePostId] = [];
            return;
          }

          const fetched = await fetchDirectMetaTree(target);
          const arr: any[] = fetched.comments;
          if (!fetched.ok) {
            const apiError = {
              post_id: nativePostId,
              fetch_post_id: fetchPostId,
              platform,
              status: fetched.status,
              payload: fetched.attempts[fetched.attempts.length - 1]?.payload ?? { message: "Meta Graph comments rejected request" },
              attempts: fetched.attempts,
            };
            apiErrors.push(apiError);
            console.error("[ayrshare-comments-fetch] Meta Graph rejected request", apiError);
            errors[nativePostId] = `HTTP ${fetched.status}: ${apiError.payload.message ?? "Meta Graph comments rejected request"}`;
            results[nativePostId] = [];
            return;
          }
          console.log("[ayrshare-comments-fetch] direct Meta comments success", { stored: nativePostId, resolved: fetched.resolvedPostId, count: arr.length });

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

        // Sanitize: keep ONLY flat scalar fields in metadata. The raw Meta
        // payload can contain nested reply/user blobs that may violate jsonb
        // size/shape constraints and cause the insert to fail silently.
        const cleanMetadata = {
          source: "meta_graph_comments_fetch",
          campaign_name: safeStr(campaignName),
          profile_ref_id: safeStr(c?.__profile_ref_id ?? "meta_graph_direct"),
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
            metadata: { parent_id: d.parent_id, sender_id: d.sender_id, source: "meta_graph_comments_fetch" },
          }),
        }).catch((e) => console.error("[ayrshare-comments-fetch] dispatch failed", e)),
      ),
    );

    // Sync campaign_logs.comment_count with the live Meta count per post so
    // the post-card header counter immediately reflects reality (e.g. "15"
    // instead of a stale "5"). Best-effort — failures are non-fatal.
    try {
      for (const [nativePostId, list] of Object.entries(results)) {
        const liveCount = Array.isArray(list) ? (list as any[]).length : 0;
        await admin
          .from("campaign_logs")
          .update({ comment_count: liveCount, metrics_updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("provider_message_id", nativePostId);
      }
    } catch (countErr) {
      console.warn("[ayrshare-comments-fetch] comment_count sync failed", countErr);
    }

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

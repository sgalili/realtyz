// meta-comments-sync — direct Meta Graph API comment ingestion and replies.
//
// Replaces the legacy Ayrshare comment pipeline (ayrshare-comments-fetch /
// ayrshare-sync-comments / ayrshare-comment-reply / fb-engagement-fetch /
// fb-engagement-reply). Everything runs against the official Graph API using
// the workspace Page access token stored by meta-page-connect.
//
// Actions (POST body { action }):
//   sync   → { success, posts, persisted, updated, comments }
//            Pulls the Page feed (or explicit post_ids) with nested replies and
//            mirrors every comment into public.engagement_events, plus
//            public.fb_comments for posts tracked in fb_engagement_posts.
//   reply  → { ok, reply_id }   POST /{comment-id}/comments
//   status → { connected, page }
import { corsHeaders } from "../_shared/cors.ts";
import {
  authorAvatar,
  cleanAuthorName,
  graphCall,
  humanizeMetaError,
  isOwnPageAuthor,
  metaAdminClient,
  resolveMetaPage,
  type MetaPage,
} from "../_shared/metaPage.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const COMMENT_FIELDS =
  "id,message,created_time,like_count,permalink_url,from{id,name,picture{url}},parent{id}";

const isUuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.trim());

const safeStr = (v: unknown, max = 500): string | null => {
  if (v === null || v === undefined) return null;
  const s = typeof v === "string" ? v : String(v);
  const t = s.trim();
  return t ? t.slice(0, max) : null;
};

type FlatComment = {
  id: string;
  postId: string;
  parentId: string | null;
  text: string;
  fromId: string | null;
  fromName: string | null;
  avatar: string | null;
  createdAt: string | null;
  likeCount: number;
  permalink: string | null;
  raw: any;
};

/** Walk a post's comment tree (comments + nested replies) into a flat list. */
async function fetchCommentTree(
  postId: string,
  page: MetaPage,
  maxDepth = 3,
): Promise<{ comments: FlatComment[]; error: string | null }> {
  const out: FlatComment[] = [];
  let error: string | null = null;

  const pull = async (nodeId: string, parentId: string | null, depth: number) => {
    if (depth > maxDepth) return;
    let next: string | null =
      `/${nodeId}/comments?fields=${encodeURIComponent(COMMENT_FIELDS)}&filter=stream&order=chronological&limit=100&access_token=${
        encodeURIComponent(page.token)
      }`;
    while (next) {
      const r: any = await graphCall(next);
      if (!r.ok) {
        error = error ?? humanizeMetaError(r.payload, "שליפת התגובות מפייסבוק נכשלה");
        return;
      }
      const rows: any[] = Array.isArray(r.payload?.data) ? r.payload.data : [];
      for (const c of rows) {
        const id = safeStr(c?.id, 200);
        if (!id) continue;
        out.push({
          id,
          postId,
          parentId: parentId ?? safeStr(c?.parent?.id, 200),
          text: safeStr(c?.message, 4000) ?? "",
          fromId: safeStr(c?.from?.id, 200),
          fromName: cleanAuthorName(c?.from?.name),
          avatar: authorAvatar(c?.from),
          createdAt: safeStr(c?.created_time),
          likeCount: Number(c?.like_count ?? 0) || 0,
          permalink: safeStr(c?.permalink_url, 1000),
          raw: c,
        });
        // `filter=stream` already flattens most threads, but nested replies on
        // older posts still need an explicit walk one level down.
        await pull(id, id, depth + 1);
      }
      const after = r.payload?.paging?.cursors?.after;
      next = rows.length === 100 && after
        ? `/${nodeId}/comments?fields=${encodeURIComponent(COMMENT_FIELDS)}&filter=stream&order=chronological&limit=100&after=${
          encodeURIComponent(after)
        }&access_token=${encodeURIComponent(page.token)}`
        : null;
    }
  };

  await pull(postId, null, 0);
  // de-dupe (a reply can surface both in the stream and in the nested walk)
  const seen = new Set<string>();
  return { comments: out.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true))), error };
}

/** Mirror one comment into engagement_events (insert or refresh). */
export async function persistComment(
  admin: any,
  ownerId: string,
  page: { pageId: string; pageName: string | null },
  c: FlatComment,
  source = "meta_comments_sync",
): Promise<"inserted" | "updated" | "skipped"> {
  if (!c.text.trim()) return "skipped";
  const selfAuthored = isOwnPageAuthor(c.fromId, c.fromName, page);
  const avatar = safeStr(c.avatar, 1000);

  const { data: exists } = await admin
    .from("engagement_events")
    .select("id, status, ai_reply_text, metadata")
    .eq("user_id", ownerId)
    .eq("external_id", c.id)
    .maybeSingle();

  const baseMeta = {
    source,
    parent_id: c.parentId,
    self_authored: selfAuthored,
    author_type: selfAuthored ? "workspace_page" : "audience",
    native_created_at: c.createdAt,
    like_count: c.likeCount,
    permalink: c.permalink,
    sender_id: c.fromId,
    profile_image: avatar,
    sender_avatar_url: avatar,
    author: { name: c.fromName, profile_image: avatar },
  };

  if (exists?.id) {
    const current = (exists.metadata && typeof exists.metadata === "object") ? exists.metadata : {};
    await admin
      .from("engagement_events")
      .update({
        external_post_id: c.postId,
        sender_handle: c.fromName,
        inbound_text: c.text,
        platform: "facebook",
        metadata: { ...current, ...baseMeta, profile_image: avatar ?? (current as any).profile_image ?? null },
      })
      .eq("id", exists.id)
      .eq("user_id", ownerId);
    return "updated";
  }

  const { error } = await admin.from("engagement_events").insert({
    user_id: ownerId,
    platform: "facebook",
    sender_handle: c.fromName,
    inbound_text: c.text,
    external_id: c.id,
    external_post_id: c.postId,
    status: selfAuthored ? "sent" : "pending",
    ai_action: selfAuthored ? "display_only" : "queued",
    metadata: baseMeta,
  });
  if (error) {
    console.error("[meta-comments-sync] engagement insert failed", error.message);
    return "skipped";
  }
  return "inserted";
}

/** Mirror comments of a tracked post into fb_comments (HITL / learning UI). */
async function persistTrackedComments(admin: any, postRowId: string, comments: FlatComment[], page: MetaPage) {
  const byParent = new Map<string, FlatComment[]>();
  for (const c of comments) {
    if (!c.parentId) continue;
    byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
  }
  for (const c of comments) {
    if (c.parentId) continue; // replies are attributed to their parent below
    const kids = byParent.get(c.id) ?? [];
    const ownReply = kids.find((k) => isOwnPageAuthor(k.fromId, k.fromName, page));
    await admin.from("fb_comments").upsert({
      post_id: postRowId,
      ayr_comment_id: c.id,
      parent_comment_id: null,
      author_name: c.fromName,
      author_fb_id: c.fromId,
      comment_text: c.text,
      likes_count: c.likeCount,
      shares_count: 0,
      posted_at: c.createdAt,
      is_historical_replied: !!ownReply,
      historical_reply_text: ownReply?.text ?? null,
      status: ownReply ? "historical" : (kids.length > 0 ? "replied" : "new"),
      raw: c.raw,
      fetched_at: new Date().toISOString(),
    }, { onConflict: "post_id,ayr_comment_id" });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  try {
    const admin = metaAdminClient();
    let body: any = {};
    try { body = await req.json(); } catch { /* noop */ }
    const action = String(body?.action ?? "sync");

    // ---- Tenant resolution -------------------------------------------------
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    let callerId: string | null = null;
    if (token) {
      try {
        const { data } = await admin.auth.getUser(token);
        callerId = data?.user?.id ?? null;
      } catch { /* service-role call */ }
    }
    let ownerId: string | null = callerId;
    if (callerId) {
      const { data: profile } = await admin
        .from("profiles")
        .select("active_workspace_owner_id")
        .eq("id", callerId)
        .maybeSingle();
      ownerId = String((profile as any)?.active_workspace_owner_id || callerId);
    }
    // Server-to-server invocations pass an explicit user_id.
    if (!callerId && typeof body?.user_id === "string") ownerId = body.user_id;
    else if (callerId && typeof body?.user_id === "string" && body.user_id !== callerId) {
      const { data: member } = await admin
        .from("workspace_memberships")
        .select("user_id")
        .eq("workspace_owner_id", body.user_id)
        .eq("user_id", callerId)
        .maybeSingle();
      if (member) ownerId = String(body.user_id);
    }
    if (!ownerId) return json({ error: "unauthorized" }, 401);

    const page = await resolveMetaPage(admin, ownerId);

    if (action === "status") {
      if (!page) return json({ connected: false, page: null });
      const r = await graphCall(`/${page.pageId}?fields=id,name&access_token=${encodeURIComponent(page.token)}`);
      return json({
        connected: r.ok,
        page: r.ok ? { id: page.pageId, name: r.payload?.name ?? page.pageName } : null,
        message: r.ok ? null : humanizeMetaError(r.payload),
      });
    }

    if (!page) {
      return json({
        success: false,
        error: "page_not_connected",
        message: "עמוד הפייסבוק לא מחובר. חבר אותו בעמוד החיבורים.",
      }, 200);
    }

    // ---- Reply to a comment (POST /{comment-id}/comments) -------------------
    if (action === "reply") {
      const rawText = String(body?.text ?? body?.final_text ?? "").trim();
      const target = String(body?.comment_id ?? "").trim();
      if (!target || !rawText) return json({ error: "comment_id and text are required" }, 400);

      // Accept either a fb_comments row id or a native Meta comment id.
      let nativeId = target;
      let commentRowId: string | null = null;
      if (isUuid(target)) {
        const { data: row } = await admin
          .from("fb_comments")
          .select("id, ayr_comment_id")
          .eq("id", target)
          .maybeSingle();
        if (!row?.ayr_comment_id) return json({ error: "comment_not_found" }, 404);
        commentRowId = String((row as any).id);
        nativeId = String((row as any).ayr_comment_id);
      }

      const r = await graphCall(`/${nativeId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ message: rawText, access_token: page.token }),
      });
      if (!r.ok) {
        return json({
          ok: false,
          error: humanizeMetaError(r.payload, "פרסום התגובה בפייסבוק נכשל"),
          meta: r.payload?.error ?? null,
        }, 200);
      }
      const replyId = safeStr(r.payload?.id, 200);

      if (commentRowId) {
        await admin.from("fb_comment_replies").insert({
          comment_id: commentRowId,
          final_text: rawText,
          mode: String(body?.mode ?? "hitl"),
          posted_by: callerId,
          ayrshare_reply_id: replyId,
          ayrshare_response: r.payload ?? {},
        });
        await admin.from("fb_comments").update({ status: "replied" }).eq("id", commentRowId);
      }
      // Keep the campaign comment stream in sync.
      await admin
        .from("engagement_events")
        .update({ status: "sent", ai_reply_text: rawText })
        .eq("user_id", ownerId)
        .eq("external_id", nativeId);

      return json({ ok: true, reply_id: replyId });
    }

    // ---- Sync ---------------------------------------------------------------
    if (action !== "sync") return json({ error: "unknown_action" }, 400);

    const explicitIds: string[] = Array.isArray(body?.post_ids)
      ? body.post_ids.filter((s: unknown): s is string => typeof s === "string" && !!s.trim() && !isUuid(s))
      : typeof body?.post_id === "string" && !isUuid(body.post_id)
      ? [body.post_id]
      : [];
    const limit = Math.min(Math.max(Number(body?.limit ?? 25) || 25, 1), 50);

    let postIds = explicitIds.slice(0, limit);
    if (postIds.length === 0) {
      const feed = await graphCall(
        `/${page.pageId}/posts?fields=id,created_time&limit=${limit}&access_token=${encodeURIComponent(page.token)}`,
      );
      if (!feed.ok) {
        return json({
          success: false,
          error: humanizeMetaError(feed.payload, "שליפת הפוסטים מפייסבוק נכשלה"),
          meta: feed.payload?.error ?? null,
        }, 200);
      }
      postIds = (Array.isArray(feed.payload?.data) ? feed.payload.data : [])
        .map((p: any) => safeStr(p?.id, 200))
        .filter((v: string | null): v is string => !!v);
    }

    // Tracked posts (HITL board) so fb_comments stays in sync too.
    const { data: tracked } = await admin.from("fb_engagement_posts").select("id, fb_post_id");
    const trackedMap = new Map<string, string>();
    for (const row of tracked ?? []) {
      const nativeId = String((row as any).fb_post_id ?? "");
      if (nativeId) trackedMap.set(nativeId, String((row as any).id));
    }

    let inserted = 0, updated = 0, total = 0;
    const errors: string[] = [];
    for (const postId of postIds) {
      const { comments, error } = await fetchCommentTree(postId, page);
      if (error) errors.push(`${postId}: ${error}`);
      total += comments.length;
      for (const c of comments) {
        const res = await persistComment(admin, ownerId, page, c);
        if (res === "inserted") inserted++;
        else if (res === "updated") updated++;
      }
      const rowId = trackedMap.get(postId) ??
        trackedMap.get(postId.includes("_") ? postId.split("_")[1] : postId);
      if (rowId && comments.length > 0) {
        await persistTrackedComments(admin, rowId, comments, page);
        await admin
          .from("fb_engagement_posts")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", rowId);
      }
    }

    return json({
      success: true,
      page: { id: page.pageId, name: page.pageName },
      posts: postIds.length,
      comments: total,
      persisted: inserted,
      updated,
      api_errors: errors,
    });
  } catch (e) {
    console.error("[meta-comments-sync] fatal", e);
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

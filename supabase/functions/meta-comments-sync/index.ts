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
  graphCall,
  humanizeMetaError,
  metaAdminClient,
  resolveMetaPage,
} from "../_shared/metaPage.ts";
import {
  fetchCommentTree,
  persistComment,
  persistTrackedComments,
  safeStr,
} from "../_shared/metaComments.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isUuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.trim());

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
      const rawText = String(body?.text ?? body?.final_text ?? body?.comment ?? "").trim();
      const target = String(body?.comment_id ?? body?.event_id ?? "").trim();
      if (!target || !rawText) return json({ error: "comment_id and text are required" }, 400);

      // Accept a fb_comments row id, an engagement_events row id, or a native
      // Meta comment id.
      let nativeId = target;
      let commentRowId: string | null = null;
      let eventRowId: string | null = null;
      if (isUuid(target)) {
        const { data: row } = await admin
          .from("fb_comments")
          .select("id, ayr_comment_id")
          .eq("id", target)
          .maybeSingle();
        if (row?.ayr_comment_id) {
          commentRowId = String((row as any).id);
          nativeId = String((row as any).ayr_comment_id);
        } else {
          const { data: ev } = await admin
            .from("engagement_events")
            .select("id, external_id")
            .eq("id", target)
            .maybeSingle();
          if (!ev?.external_id) return json({ error: "comment_not_found" }, 404);
          eventRowId = String((ev as any).id);
          nativeId = String((ev as any).external_id);
        }
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
        // Knowledge-base write-back so the persona learns from approved replies.
        let kbDocId: string | null = null;
        try {
          const { data: row } = await admin
            .from("fb_comments")
            .select("comment_text, author_name")
            .eq("id", commentRowId)
            .maybeSingle();
          const kbBody = `שאלה/תגובה: ${(row as any)?.comment_text ?? ""}\n\nתשובה: ${rawText}`;
          const { data: doc } = await admin.from("knowledge_documents").insert({
            user_id: ownerId,
            source_type: "text",
            title: `תגובת פייסבוק — ${(row as any)?.author_name ?? "גולש"}`,
            raw_text: kbBody,
            source_metadata: { source: "meta_comments", comment_id: commentRowId, meta_comment_id: nativeId },
            is_active: true,
            chunk_count: 1,
          }).select("id").maybeSingle();
          kbDocId = (doc as any)?.id ?? null;
          if (kbDocId) {
            await admin.from("knowledge_chunks").insert({
              document_id: kbDocId,
              user_id: ownerId,
              chunk_index: 0,
              content: kbBody,
            });
          }
        } catch (kbErr) {
          console.error("[meta-comments-sync] KB write-back failed", kbErr);
        }

        await admin.from("fb_comment_replies").insert({
          comment_id: commentRowId,
          final_text: rawText,
          mode: String(body?.mode ?? "hitl"),
          posted_by: callerId,
          ayrshare_reply_id: replyId,
          ayrshare_response: r.payload ?? {},
          kb_document_id: kbDocId,
        });
        await admin.from("fb_comments").update({ status: "replied" }).eq("id", commentRowId);
      }
      // Keep the campaign comment stream in sync.
      const streamPatch = { status: "sent", ai_reply_text: rawText };
      if (eventRowId) {
        await admin.from("engagement_events").update(streamPatch).eq("id", eventRowId);
      } else {
        await admin
          .from("engagement_events")
          .update(streamPatch)
          .eq("user_id", ownerId)
          .eq("external_id", nativeId);
      }

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

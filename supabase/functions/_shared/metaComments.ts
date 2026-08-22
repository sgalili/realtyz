// Shared comment ingestion logic for the direct Meta Graph API pipeline.
// Used by meta-comments-sync (polling) and meta-comments-webhook (realtime).
import {
  authorAvatar,
  cleanAuthorName,
  graphCall,
  humanizeMetaError,
  isOwnPageAuthor,
  type MetaPage,
} from "./metaPage.ts";

export const COMMENT_FIELDS =
  "id,message,created_time,like_count,permalink_url,from{id,name,picture{url}},parent{id}";

export const safeStr = (v: unknown, max = 500): string | null => {
  if (v === null || v === undefined) return null;
  const s = typeof v === "string" ? v : String(v);
  const t = s.trim();
  return t ? t.slice(0, max) : null;
};

export type FlatComment = {
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

export const toFlatComment = (c: any, postId: string, parentId: string | null = null): FlatComment | null => {
  const id = safeStr(c?.id, 200);
  if (!id) return null;
  return {
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
  };
};

/** Walk a post's comment tree (comments + nested replies) into a flat list. */
export async function fetchCommentTree(
  postId: string,
  page: MetaPage,
  maxDepth = 2,
): Promise<{ comments: FlatComment[]; error: string | null }> {
  const out: FlatComment[] = [];
  let error: string | null = null;
  const qs = (nodeId: string, after?: string) =>
    `/${nodeId}/comments?fields=${encodeURIComponent(COMMENT_FIELDS)}&filter=stream&order=chronological&limit=100${
      after ? `&after=${encodeURIComponent(after)}` : ""
    }&access_token=${encodeURIComponent(page.token)}`;

  const pull = async (nodeId: string, parentId: string | null, depth: number) => {
    if (depth > maxDepth) return;
    let next: string | null = qs(nodeId);
    while (next) {
      const r: any = await graphCall(next);
      if (!r.ok) {
        error = error ?? humanizeMetaError(r.payload, "שליפת התגובות מפייסבוק נכשלה");
        return;
      }
      const rows: any[] = Array.isArray(r.payload?.data) ? r.payload.data : [];
      for (const raw of rows) {
        const flat = toFlatComment(raw, postId, parentId);
        if (!flat) continue;
        out.push(flat);
        await pull(flat.id, flat.id, depth + 1);
      }
      const after = r.payload?.paging?.cursors?.after;
      next = rows.length === 100 && after ? qs(nodeId, after) : null;
    }
  };

  await pull(postId, null, 0);
  const seen = new Set<string>();
  return {
    comments: out.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true))),
    error,
  };
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
        metadata: {
          ...current,
          ...baseMeta,
          profile_image: avatar ?? (current as any).profile_image ?? null,
        },
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
    console.error("[metaComments] engagement insert failed", error.message);
    return "skipped";
  }
  return "inserted";
}

/** Mirror top-level comments of a tracked post into fb_comments (HITL board). */
export async function persistTrackedComments(
  admin: any,
  postRowId: string,
  comments: FlatComment[],
  page: { pageId: string; pageName: string | null },
) {
  const byParent = new Map<string, FlatComment[]>();
  for (const c of comments) {
    if (!c.parentId) continue;
    byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
  }
  for (const c of comments) {
    if (c.parentId) continue;
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

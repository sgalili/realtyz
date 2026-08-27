// fb-comments-backfill — pulls the full comment tree (with nested replies) for
// every stored Facebook post published since a given date, and returns an
// explicit per-post report so the UI can show the user exactly what failed and
// why (missing page, missing permission, expired token, rate limit).
import { corsHeaders } from "../_shared/cors.ts";
import { metaAdminClient, resolveMetaPage } from "../_shared/metaPage.ts";
import {
  fetchCommentTree,
  persistComment,
  persistTrackedComments,
} from "../_shared/metaComments.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  try {
    const admin = metaAdminClient();
    let body: any = {};
    try { body = await req.json(); } catch { /* noop */ }

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    let callerId: string | null = null;
    if (jwt) {
      try {
        const { data } = await admin.auth.getUser(jwt);
        callerId = data?.user?.id ?? null;
      } catch { /* service-role */ }
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
    if (!callerId && typeof body?.user_id === "string") ownerId = body.user_id;
    if (!ownerId) {
      return json({
        ok: false,
        error: "unauthorized",
        message: "לא זוהה משתמש מחובר. התחבר מחדש לאפליקציה ונסה שוב.",
      }, 401);
    }

    const since = typeof body?.since === "string" && body.since.trim()
      ? body.since.trim()
      : "2026-07-27";
    const maxPosts = Math.min(300, Math.max(1, Number(body?.max_posts ?? 200) || 200));

    const page = await resolveMetaPage(admin, ownerId);
    if (!page?.token || !page?.pageId) {
      return json({
        ok: false,
        error: "page_not_connected",
        message: "אין עמוד פייסבוק מחובר לחשבון הזה, לכן אין דרך לשלוף תגובות.",
        how_to_fix: [
          "פתח /profile → חיבורים → פייסבוק ואינסטגרם.",
          "לחץ על חיבור פייסבוק ואשר את ההרשאות (pages_show_list, pages_read_engagement, pages_manage_posts).",
          "אחרי החיבור חזור לעמוד הקמפיינים והרץ ייבוא מחדש.",
        ],
        since,
      });
    }

    const { data: posts } = await admin
      .from("campaign_logs")
      .select("provider_message_id, created_at")
      .eq("user_id", ownerId)
      .eq("channel", "facebook")
      .eq("is_archived", false)
      .gte("created_at", since)
      .not("provider_message_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(maxPosts);

    const ids = (posts ?? [])
      .map((r: any) => String(r.provider_message_id || ""))
      .filter((id) => /^\d{5,}(_\d{5,})?$/.test(id));

    const { data: tracked } = await admin
      .from("fb_engagement_posts")
      .select("id, fb_post_id");
    const trackedMap = new Map<string, string>();
    for (const row of tracked ?? []) {
      const nativeId = String((row as any).fb_post_id ?? "");
      if (nativeId) trackedMap.set(nativeId, String((row as any).id));
    }

    let comments = 0;
    let inserted = 0;
    let updated = 0;
    const failures: Array<{ post_id: string; error: string }> = [];

    for (const postId of ids) {
      const { comments: tree, error } = await fetchCommentTree(postId, page);
      if (error) {
        failures.push({ post_id: postId, error: String(error) });
        continue;
      }
      comments += tree.length;
      for (const c of tree) {
        const res = await persistComment(admin, ownerId, page, c);
        if (res === "inserted") inserted++;
        else if (res === "updated") updated++;
      }
      const rowId = trackedMap.get(postId) ??
        trackedMap.get(postId.includes("_") ? postId.split("_")[1] : postId);
      if (rowId && tree.length > 0) {
        await persistTrackedComments(admin, rowId, tree, page);
        await admin
          .from("fb_engagement_posts")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", rowId);
      }
    }

    return json({
      ok: failures.length === 0 || comments > 0,
      since,
      page: { id: page.pageId, name: page.pageName },
      posts_scanned: ids.length,
      comments,
      persisted: inserted,
      updated,
      failed_posts: failures.length,
      failures: failures.slice(0, 20),
      message: failures.length > 0
        ? "חלק מהפוסטים לא החזירו תגובות מפייסבוק (בדרך כלל בגלל הרשאה חסרה או טוקן שפג)."
        : null,
      how_to_fix: failures.length > 0
        ? [
          "חבר מחדש את עמוד הפייסבוק ואשר pages_read_engagement.",
          "ודא שאתה Admin של העמוד ולא רק Editor.",
          "אם מופיע rate limit, המתן כמה דקות והרץ שוב.",
        ]
        : [],
    });
  } catch (e) {
    return json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      message: "הייבוא נעצר בשגיאה לא מזוהה.",
    }, 200);
  }
});

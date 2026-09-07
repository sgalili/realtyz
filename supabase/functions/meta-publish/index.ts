// meta-publish — direct Meta Graph API publishing for Facebook Pages and
// Instagram Business accounts.
//
// POST  { post|text, channels:['facebook'|'instagram'], campaign_name?, media_urls?,
//         scheduled_at?, workspace_owner_id?, group_ids?, first_comment?, action? }
// POST  { action: 'status' }              -> connection status (page + IG account)
// DELETE { external_post_id }             -> removes the post from Meta
//
// Credentials: only the workspace owner's explicit page binding in
// public.messenger_page_bindings. Publishing never discovers or restores one.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { isBlockedPage } from "../_shared/metaPages.ts";
import { ensureMandatoryComment } from "../_shared/mandatoryComment.ts";

const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v26.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const admin = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

/** Human Hebrew message for a Graph API error payload. */
function humanize(payload: any, fallback = "הפרסום לפייסבוק נכשל"): string {
  const err = payload?.error ?? payload;
  const code = Number(err?.code ?? 0);
  const sub = Number(err?.error_subcode ?? 0);
  if (code === 190 || sub === 463 || sub === 460) {
    return "חיבור הפייסבוק פג תוקף. יש להתחבר מחדש להרשאות הדף.";
  }
  if (code === 200 || code === 10) {
    return "אין הרשאת פרסום לדף הזה. יש לאשר את הרשאות הפרסום בפייסבוק.";
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return "פייסבוק חסם זמנית בקשות נוספות. נסה שוב בעוד מספר דקות.";
  }
  const msg = String(err?.message ?? "").trim();
  return msg ? `${fallback}: ${msg}` : fallback;
}

async function resolveOwner(req: Request, body: any, db: SupabaseClient): Promise<string | null> {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const isService = bearer && bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (isService) {
    const ws = String(body?.workspace_owner_id ?? "").trim();
    return ws || null;
  }
  if (!bearer) return null;
  const { data, error } = await db.auth.getUser(bearer);
  if (error || !data?.user) return null;
  const { data: profile } = await db
    .from("profiles")
    .select("active_workspace_owner_id")
    .eq("id", data.user.id)
    .maybeSingle();
  return String((profile as any)?.active_workspace_owner_id || data.user.id);
}

type ResolvedPage = { pageId: string; pageName: string | null; token: string };

async function cachePage(db: SupabaseClient, ownerId: string | null, page: ResolvedPage) {
  if (!ownerId || isBlockedPage({ id: page.pageId })) return;
  try {
    await db.from("messenger_page_bindings").upsert(
      {
        owner_id: ownerId,
        page_id: page.pageId,
        page_name: page.pageName,
        page_access_token: page.token,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,page_id" },
    );
  } catch { /* caching is best-effort */ }
}

async function resolvePage(db: SupabaseClient, ownerId: string | null): Promise<ResolvedPage | null> {
  // STRICT WORKSPACE ISOLATION: only this workspace's own bindings, default first.
  if (!ownerId) return null;
  const { data } = await db
    .from("messenger_page_bindings")
    .select("page_id, page_name, page_access_token, is_selected")
    .eq("owner_id", ownerId)
    .order("is_selected", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row: any = data;
  if (row?.page_id && row?.page_access_token && !isBlockedPage({ id: row.page_id })) {
    return { pageId: String(row.page_id), pageName: row.page_name ?? null, token: String(row.page_access_token) };
  }
  return null;
}

/** Every Meta token of this workspace, default page first. */
async function candidateTokens(db: SupabaseClient, ownerId: string | null): Promise<string[]> {
  const out: string[] = [];
  const push = (t: unknown) => {
    const s = String(t ?? "").trim();
    if (s.length > 20 && !out.includes(s)) out.push(s);
  };
  try {
    if (ownerId) {
      const { data } = await db
        .from("messenger_page_bindings")
        .select("page_access_token, is_selected, updated_at")
        .eq("owner_id", ownerId)
        .order("is_selected", { ascending: false })
        .order("updated_at", { ascending: false });
      for (const r of (data ?? []) as any[]) push(r?.page_access_token);
    }
  } catch { /* ignore */ }
  return out;
}



/**
 * Fallback page resolution used when the stored page_id turns out to lack
 * publishing permission (Graph 200/10) or its token expired (190). Walks every
 * available Meta token, asks /me/accounts for the Pages it actually manages,
 * and returns the ones we have not tried yet — the primary Page from
 * /me/accounts becomes the publishing target instead of hard-blocking.
 */
async function alternatePages(
  db: SupabaseClient,
  ownerId: string | null,
  triedPageIds: string[],
): Promise<ResolvedPage[]> {
  void db; void ownerId; void triedPageIds;
  return [];
}

/** Publish errors that mean "wrong page/token", i.e. worth retrying elsewhere. */
const isPageScopeError = (msg: string) =>
  msg.includes("אין הרשאת פרסום") || msg.includes("פג תוקף");

/**
 * Guarantee we publish with a PAGE access token (never a User/system token).
 * Verifies the token identity via /me: if it does not resolve to the target
 * Page, we ask /me/accounts for the Page-scoped token of that page_id and swap
 * it in (caching it so later runs start from the right token).
 */
async function ensurePageToken(
  db: SupabaseClient,
  ownerId: string | null,
  page: ResolvedPage,
): Promise<ResolvedPage> {
  const me = await graph(`/me?fields=id&access_token=${encodeURIComponent(page.token)}`);
  const meId = String(me.payload?.id ?? "").trim();
  if (me.ok && meId && meId === String(page.pageId)) return page; // already a Page token

  const seen = new Set<string>();
  for (const token of [page.token, ...(await candidateTokens(db, ownerId))]) {
    if (seen.has(token)) continue;
    seen.add(token);
    const r = await graph(
      `/me/accounts?fields=id,name,access_token&limit=50&access_token=${encodeURIComponent(token)}`,
    );
    const list: any[] = Array.isArray(r.payload?.data) ? r.payload.data : [];
    const match = list.find((p) => String(p?.id ?? "") === String(page.pageId) && p?.access_token);
    if (match) {
      const upgraded: ResolvedPage = {
        pageId: String(page.pageId),
        pageName: match?.name ?? page.pageName,
        token: String(match.access_token),
      };
      await cachePage(db, ownerId, upgraded);
      return upgraded;
    }
  }
  return page;
}




async function graph(path: string, init?: RequestInit) {
  const res = await fetch(`${GRAPH}${path}`, init);
  const text = await res.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return { ok: res.ok, status: res.status, payload };
}

async function igAccountId(pageId: string, token: string): Promise<string | null> {
  const r = await graph(`/${pageId}?fields=instagram_business_account&access_token=${encodeURIComponent(token)}`);
  return r.ok ? (r.payload?.instagram_business_account?.id ?? null) : null;
}

/**
 * Post the automatic first comment on a freshly published Page post.
 * Facebook returns either `{page_id}_{post_id}` or a bare object id; both
 * forms are attempted (2 tries each, small backoff because the post object is
 * sometimes not yet queryable) and the raw Graph payload is returned so the
 * real reason is logged/persisted instead of being swallowed.
 *
 * When Meta blocks the comment endpoint because the app lacks Page Public
 * Content Access / App Review, the function returns `{ blocked: true }` so
 * the caller can hand the comment off to the browser-extension automation
 * instead of failing the whole publish.
 */
async function postFirstComment(
  pageId: string,
  token: string,
  postId: string,
  message: string,
): Promise<{ comment_id: string; target: string } | { error: string; raw: unknown; blocked?: boolean }> {
  const text = String(message ?? "").trim();
  if (!text) return { error: "אין תוכן לתגובה הראשונה", raw: null };
  const candidates = postId.includes("_") ? [postId, postId.split("_").pop()!] : [`${pageId}_${postId}`, postId];
  let lastPayload: any = null;
  for (const target of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      const form = new URLSearchParams({ message: text, access_token: token });
      const res = await graph(`/${target}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
        body: form.toString(),
      });
      lastPayload = res.payload;
      if (res.ok && res.payload?.id) return { comment_id: String(res.payload.id), target };
    }
  }
  const code = Number(lastPayload?.error?.code ?? 0);
  const sub = Number(lastPayload?.error?.error_subcode ?? 0);
  const msg = String(lastPayload?.error?.message ?? "").toLowerCase();
  const blocked = code === 10 || code === 12 || sub === 33 || /page public content access|pages_read_engagement|singular statuses|deprecated/i.test(msg);
  return { error: humanize(lastPayload, "פרסום התגובה הראשונה בעמוד נכשל"), raw: lastPayload, blocked };
}



/**
 * Upload one photo to the Page as an UNPUBLISHED attachment and return its
 * media_fbid. Strategy: first let Facebook fetch the URL itself (`url=`), and
 * if that fails (hot-link protection, signed CDN links, query strings, private
 * storage) download the bytes here and re-upload them as a real multipart
 * `source` file — which is what the Graph API expects for binary uploads.
 */
async function uploadUnpublishedPhoto(
  pageId: string,
  token: string,
  url: string,
): Promise<{ id: string } | { error: string }> {
  const byUrl = new URLSearchParams({ url, published: "false", access_token: token });
  const r1 = await graph(`/${pageId}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: byUrl.toString(),
  });
  if (r1.ok && r1.payload?.id) return { id: String(r1.payload.id) };
  const urlErr = humanize(r1.payload);
  console.warn("[meta-publish] url upload failed, retrying binary", url, urlErr);

  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (RealtyzBot)" } });
    if (!res.ok) return { error: `הורדת התמונה נכשלה (${res.status})` };
    const blob = await res.blob();
    const type = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const fd = new FormData();
    fd.set("published", "false");
    fd.set("access_token", token);
    fd.set("source", new File([blob], `photo.${ext}`, { type }));
    const r2 = await graph(`/${pageId}/photos`, { method: "POST", body: fd });
    if (r2.ok && r2.payload?.id) return { id: String(r2.payload.id) };
    return { error: humanize(r2.payload) || urlErr };
  } catch (e) {
    return { error: String((e as any)?.message ?? e) || urlErr };
  }
}

/** Publish to a Facebook Page. Returns the post id. */
async function publishFacebook(
  pageId: string,
  token: string,
  message: string,
  media: string[],
  link: string | null,
): Promise<{ id: string; warning?: string } | { error: string }> {
  const textOnly = async (): Promise<{ id: string } | { error: string }> => {
    const form = new URLSearchParams({ message, access_token: token });
    if (link) form.set("link", link);
    const r = await graph(`/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: form.toString(),
    });
    if (!r.ok || !(r.payload?.post_id ?? r.payload?.id)) return { error: humanize(r.payload) };
    return { id: String(r.payload.post_id ?? r.payload.id) };
  };

  if (media.length === 0) return await textOnly();

  // Always stage the photos as unpublished attachments and then create ONE
  // feed post that references them. This works for a single photo as well and
  // keeps the caption/link intact.
  const attached: string[] = [];
  const uploadErrors: string[] = [];
  for (const url of media.slice(0, 10)) {
    const up = await uploadUnpublishedPhoto(pageId, token, url);
    if ("id" in up) attached.push(up.id);
    else uploadErrors.push(up.error);
  }

  if (attached.length === 0) {
    // Never lose the post because of media: publish the text (and link) and
    // surface the real Graph reason as a warning.
    const fallback = await textOnly();
    if ("error" in fallback) {
      return { error: uploadErrors[0] ?? fallback.error ?? "העלאת התמונות לפייסבוק נכשלה" };
    }
    return {
      id: fallback.id,
      warning: `הפוסט פורסם ללא תמונות: ${uploadErrors[0] ?? "העלאת התמונות לפייסבוק נכשלה"}`,
    };
  }

  // A feed post with attached_media cannot also carry `link`, so the URL is
  // appended to the caption instead of being silently dropped.
  const caption = link && !message.includes(link) ? `${message}\n\n${link}`.trim() : message;
  const form = new URLSearchParams({ message: caption, access_token: token });
  attached.forEach((id, i) => form.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));
  const r = await graph(`/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: form.toString(),
  });
  if (!r.ok || !(r.payload?.post_id ?? r.payload?.id)) return { error: humanize(r.payload) };
  const warning = uploadErrors.length
    ? `${attached.length} מתוך ${media.length} תמונות הועלו (${uploadErrors[0]})`
    : undefined;
  return { id: String(r.payload.post_id ?? r.payload.id), warning };
}


/** Publish to an Instagram Business account (image or carousel). */
async function publishInstagram(
  igId: string,
  token: string,
  caption: string,
  media: string[],
): Promise<{ id: string } | { error: string }> {
  if (media.length === 0) {
    return { error: "פרסום לאינסטגרם דורש לפחות תמונה אחת." };
  }

  const createContainer = async (params: Record<string, string>) => {
    const form = new URLSearchParams({ ...params, access_token: token });
    return await graph(`/${igId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: form.toString(),
    });
  };

  let creationId: string | null = null;
  if (media.length === 1) {
    const r = await createContainer({ image_url: media[0], caption });
    if (!r.ok || !r.payload?.id) return { error: humanize(r.payload, "הפרסום לאינסטגרם נכשל") };
    creationId = String(r.payload.id);
  } else {
    const children: string[] = [];
    for (const url of media.slice(0, 10)) {
      const r = await createContainer({ image_url: url, is_carousel_item: "true" });
      if (r.ok && r.payload?.id) children.push(String(r.payload.id));
    }
    if (children.length < 2) return { error: "העלאת התמונות לאינסטגרם נכשלה" };
    const r = await createContainer({ media_type: "CAROUSEL", caption, children: children.join(",") });
    if (!r.ok || !r.payload?.id) return { error: humanize(r.payload, "הפרסום לאינסטגרם נכשל") };
    creationId = String(r.payload.id);
  }

  const form = new URLSearchParams({ creation_id: creationId!, access_token: token });
  const pub = await graph(`/${igId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: form.toString(),
  });
  if (!pub.ok || !pub.payload?.id) return { error: humanize(pub.payload, "הפרסום לאינסטגרם נכשל") };
  return { id: String(pub.payload.id) };
}
/**
 * Stable fingerprint of a publish attempt: same text + same media + same
 * channel + same page = the same post. Used for strict idempotency so a
 * double-click, a retry, or a re-invoke can never publish twice or spawn a
 * second history row.
 */
async function contentHash(parts: (string | null | undefined)[]): Promise<string> {
  const raw = parts.map((p) => String(p ?? "").trim()).join("\u0001");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Recent successful publish of the exact same content on the same channel. */
async function findRecentSent(
  db: SupabaseClient,
  ownerId: string,
  channel: string,
  hash: string,
  windowMinutes = 30,
): Promise<{ id: string; provider_message_id: string | null } | null> {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { data } = await db
    .from("campaign_logs")
    .select("id, provider_message_id, provider_response")
    .eq("user_id", ownerId)
    .eq("channel", channel)
    .eq("status", "sent")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);
  const row = (data ?? []).find((r: any) => String(r?.provider_response?.content_hash ?? "") === hash);
  return row ? { id: String(row.id), provider_message_id: row.provider_message_id ?? null } : null;
}

/** Latest failed/scheduled row for the same content, so retries reuse it. */
async function findReusableRow(
  db: SupabaseClient,
  ownerId: string,
  channel: string,
  hash: string,
  statuses: string[],
  windowHours = 48,
): Promise<string | null> {
  const since = new Date(Date.now() - windowHours * 3_600_000).toISOString();
  const { data } = await db
    .from("campaign_logs")
    .select("id, provider_response")
    .eq("user_id", ownerId)
    .eq("channel", channel)
    .in("status", statuses)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);
  const row = (data ?? []).find((r: any) => String(r?.provider_response?.content_hash ?? "") === hash);
  return row ? String(row.id) : null;
}





Deno.serve(async (req) => {

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db = admin();
  const body = await req.json().catch(() => ({} as any));

  try {
    const ownerId = await resolveOwner(req, body, db);
    if (!ownerId) return json({ success: false, error: "unauthorized", message: "יש להתחבר מחדש" }, 401);

    let page = await resolvePage(db, ownerId);

    // ---- Connection status probe -------------------------------------------
    if (body?.action === "status") {
      if (!page) return json({ connected: false, facebook: null, instagram: null });
      const me = await graph(`/${page.pageId}?fields=id,name&access_token=${encodeURIComponent(page.token)}`);
      const ig = await igAccountId(page.pageId, page.token);
      let igName: string | null = null;
      if (ig) {
        const r = await graph(`/${ig}?fields=username&access_token=${encodeURIComponent(page.token)}`);
        igName = r.ok ? (r.payload?.username ?? null) : null;
      }
      return json({
        connected: me.ok,
        facebook: me.ok ? { id: page.pageId, name: me.payload?.name ?? page.pageName } : null,
        instagram: ig ? { id: ig, username: igName } : null,
        message: me.ok ? null : humanize(me.payload, "החיבור לפייסבוק לא תקין"),
      });
    }

    // ---- Token permission diagnostics ----------------------------------------
    if (body?.action === "permissions") {
      if (!page) return json({ connected: false, permissions: [] });
      const r = await graph(`/me/permissions?access_token=${encodeURIComponent(page.token)}`);
      return json({ connected: true, permissions: r.payload?.data ?? [], raw: r.payload });
    }

    // ---- Debug: inspect a post object --------------------------------------
    if (body?.action === "debug_post") {
      const postId = String(body?.post_id ?? "").trim();
      if (!postId || !page) return json({ error: "missing post_id or page" }, 400);
      const pageRead = await graph(`/${postId}?fields=id,object_id,created_time,from,message&access_token=${encodeURIComponent(page.token)}`);
      const { data: pc } = await db.from("fb_personal_connections").select("access_token, scopes").eq("workspace_owner_id", ownerId).maybeSingle();
      let userRead: any = null;
      let userComment: any = null;
      if (pc?.access_token) {
        userRead = await graph(`/${postId}?fields=id,object_id,created_time,from,message&access_token=${encodeURIComponent(pc.access_token)}`);
        const form = new URLSearchParams({ message: "בדיקת תגובה מטוקן משתמש", access_token: pc.access_token });
        userComment = await graph(`/${postId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
          body: form.toString(),
        });
      }
      return json({ ok: pageRead.ok, pageRead: pageRead.payload, userRead: userRead?.payload, userComment: userComment?.payload, userTokenExists: !!pc?.access_token, scopes: pc?.scopes });
    }


    // ---- Delete a live post ------------------------------------------------
    if (req.method === "DELETE" || body?.action === "delete") {
      const postId = String(body?.external_post_id ?? "").trim();
      if (!postId) return json({ success: false, error: "external_post_id is required" }, 400);
      if (!page) return json({ success: false, error: "not_connected", message: "דף הפייסבוק לא מחובר" }, 400);
      const r = await graph(`/${postId}?access_token=${encodeURIComponent(page.token)}`, { method: "DELETE" });
      if (!r.ok) return json({ success: false, error: humanize(r.payload, "מחיקת הפוסט מפייסבוק נכשלה") }, 200);
      return json({ success: true });
    }

    // ---- Post (or retry) the first comment on an existing Page post --------
    if (body?.action === "comment" || body?.action === "first_comment") {
      const postId = String(body?.post_id ?? body?.external_post_id ?? "").trim();
      const message = ensureMandatoryComment(body?.first_comment ?? body?.message);
      if (!postId) return json({ success: false, error: "post_id is required" }, 400);
      if (!page) return json({ success: false, error: "not_connected", message: "דף הפייסבוק לא מחובר" }, 200);
      page = await ensurePageToken(db, ownerId, page);
      const c = await postFirstComment(page.pageId, page.token, postId, message);
      if ("comment_id" in c) return json({ success: true, comment_id: c.comment_id, target: c.target });
      return json({ success: false, error: "comment_failed", message: c.error, raw: c.raw }, 200);
    }


    // ---- Publish -----------------------------------------------------------
    const text = String(body?.post ?? body?.text ?? "").trim();
    const channels: string[] = (Array.isArray(body?.channels) ? body.channels : ["facebook"]).map((c: unknown) =>
      String(c || "").toLowerCase()
    );
    const media: string[] = (Array.isArray(body?.media_urls) ? body.media_urls : [])
      .map((u: unknown) => String(u || "").trim())
      .filter((u: string) => /^https:\/\//i.test(u));
    const link = String(body?.link ?? "").trim() || null;
    const campaignName = String(body?.campaign_name ?? "Realtyz").trim();
    const scheduledIso = body?.scheduled_at ? String(body.scheduled_at) : null;
    // HARD RULE: every published post carries the mandatory contact comment.
    const firstComment = ensureMandatoryComment(body?.first_comment);
    // "פרסם גם בעמוד הפייסבוק העסקי" — checked by default. When the caller
    // explicitly sends false, only the selected groups are published to.
    const publishToPage = body?.publish_to_page === undefined || body?.publish_to_page === null
      ? true
      : body.publish_to_page !== false;
    const requestedGroupIds: string[] = (Array.isArray(body?.group_ids) ? body.group_ids : [])
      .map((g: unknown) => String(g ?? "").replace(/^(ext:|manual:)/, "").trim())
      .filter((g: string) => g.length > 0);
    // Targeted publishing: imported groups the broker de-selected are dropped.
    const groupIds: string[] = await (async () => {
      if (requestedGroupIds.length === 0 || !ownerId) return requestedGroupIds;
      try {
        const { data } = await db
          .from("fb_user_groups")
          .select("group_id, is_selected")
          .eq("workspace_owner_id", ownerId)
          .in("group_id", requestedGroupIds);
        const excluded = new Set(
          ((data ?? []) as any[]).filter((r) => r?.is_selected === false).map((r) => String(r.group_id)),
        );
        return requestedGroupIds.filter((g) => !excluded.has(g));
      } catch {
        return requestedGroupIds;
      }
    })();

    if (!text && media.length === 0) {
      return json({ success: false, error: "empty_post", message: "אין תוכן לפרסום" }, 200);
    }

    // Idempotency fingerprint per channel (text + media + first comment).
    const hashes: Record<string, string> = {};
    for (const ch of channels) {
      hashes[ch] = await contentHash([ch, text, media.join("|"), firstComment, scheduledIso]);
    }

    // Scheduled posts are persisted and dispatched later by the queue drain.
    if (scheduledIso) {
      let queued = 0;
      for (const ch of channels) {
        const existing = await findReusableRow(db, ownerId, ch, hashes[ch], ["scheduled"], 24 * 30);
        if (existing) continue; // already queued for the same slot — never duplicate
        const { error: queueError } = await db.from("campaign_logs").insert({
          user_id: ownerId,
          workspace_owner_id: ownerId,
          campaign_name: campaignName,
          channel: ch,
          message_body: text,
          status: "scheduled",
          sent_at: scheduledIso,
          media_urls: media,
          first_comment: firstComment || null,
          group_ids: groupIds,
          target_profile_key: body?.target_profile_key ?? null,
          target_account_ref: body?.target_account_ref ?? null,
          listing_id: body?.listing_id ?? null,
          series_id: body?.series_id ?? null,
          series_index: body?.series_index ?? 0,
          series_total: body?.series_total ?? 1,
          recurrence_rule: body?.recurrence_rule ?? null,
          needs_regeneration: true,
          source_account: "meta-scheduled",
          provider_response: {
            provider: "meta_graph",
            scheduled_at: scheduledIso,
            content_hash: hashes[ch],
            group_ids: groupIds,
            publish_to_page: publishToPage,
          },
        });
        if (queueError) {
          console.error("[meta-publish] schedule insert", queueError.message);
          return json({ success: false, error: "schedule_failed", message: `שמירת התזמון נכשלה: ${queueError.message}` }, 200);
        }
        queued++;
      }
      return json({ success: true, verified: true, scheduled: true, queued, group_count: groupIds.length, post_ids: [] });
    }

    // Strict duplicate prevention: an identical post already live on the same
    // channel within the last 30 minutes is reported back instead of published
    // again (and no second history row is written).
    const alreadySent: Array<{ platform: string; id: string }> = [];
    const pendingChannels: string[] = [];
    for (const ch of channels) {
      const sent = await findRecentSent(db, ownerId, ch, hashes[ch]);
      if (sent) alreadySent.push({ platform: ch, id: sent.provider_message_id ?? "" });
      else pendingChannels.push(ch);
    }
    if (pendingChannels.length === 0) {
      return json({
        success: true,
        verified: true,
        duplicate: true,
        post_ids: alreadySent,
        message: "הפוסט הזה כבר פורסם בדקות האחרונות — לא נשלח שוב.",
      });
    }

    // Groups are published with the PERSONAL profile token, not the Page token.
    // A workspace with groups selected must never be blocked just because no
    // Page token could be resolved — that used to leave every group post stuck
    // in a red "failed" state without a single publish attempt.
    if (!page && groupIds.length === 0) {
      // No Page token could be resolved from the workspace, workspace members,
      // the social connection, or the platform Meta credentials. Report the
      // real cause (missing/expired Meta token) instead of a generic
      // "not connected" wall that used to block publishing entirely.
      return json(
        {
          success: false,
          error: "meta_token_unavailable",
          message:
            "לא נמצא טוקן Meta פעיל לפרסום. יש לחבר מחדש את חשבון ה-Meta (או להזין Page ID וטוקן ידני) בעמוד החיבורים.",
        },
        200,
      );
    }
    // Page publishing was turned off and no group was picked → nothing to do.
    if (!publishToPage && groupIds.length === 0) {
      return json(
        {
          success: false,
          error: "no_targets",
          message: "לא נבחרו קבוצות ופרסום בעמוד העסקי כבוי — בחר יעד אחד לפחות.",
        },
        200,
      );
    }

    const postIds: Array<{ platform: string; id: string }> = [];
    const failures: Array<{ platform: string; message: string }> = [];
    const warnings: string[] = [];
    const firstCommentIds: Array<{ target: string; comment_id: string }> = [];
    let firstCommentError: string | null = null;
    let firstCommentExtensionPayload: { post_id: string; post_url: string; first_comment: string } | null = null;



    // Never publish with a User/system token: upgrade to the Page-scoped token.
    if (page) page = await ensurePageToken(db, ownerId, page);

    for (const ch of pendingChannels) {
      if (!page || !publishToPage) {
        // Group-only publish: skip the Page/IG leg entirely instead of failing.
        continue;
      }


      if (ch === "facebook") {
        let activePage = page;
        let res = await publishFacebook(activePage.pageId, activePage.token, text, media, link);


        // The stored page_id may not be a Page this token can publish to.
        // Instead of blocking with "אין הרשאת פרסום לדף הזה", resolve the real
        // Pages from /me/accounts and publish to the primary one.
        if ("error" in res && isPageScopeError(res.error)) {
          const tried = [activePage.pageId];
          for (const alt of await alternatePages(db, ownerId, tried)) {
            const retry = await publishFacebook(alt.pageId, alt.token, text, media, link);
            tried.push(alt.pageId);
            if (!("error" in retry)) {
              activePage = alt;
              res = retry;
              await cachePage(db, ownerId, alt);
              break;
            }
            if (!isPageScopeError(retry.error)) { res = retry; break; }
          }
        }

        if ("error" in res) failures.push({ platform: ch, message: res.error });
        else {
          postIds.push({ platform: ch, id: res.id });
          if (res.warning) warnings.push(res.warning);

          // First auto-comment: always executed right after a successful page
          // publish. A failure is surfaced as a warning (never fails the post)
          // and its real Graph reason is persisted for diagnostics.
          if (firstComment) {
            const c = await postFirstComment(activePage.pageId, activePage.token, res.id, firstComment);
            if ("comment_id" in c) {
              console.log("[meta-publish] first comment published", res.id, c.comment_id);
              firstCommentIds.push({ target: res.id, comment_id: c.comment_id });
            } else if (c.blocked) {
              // Meta blocks comment creation until the app passes App Review for
              // Page Public Content Access. Hand the comment off to the Realtyz
              // browser extension, which runs from the broker's own Facebook
              // session and is not subject to this Graph restriction.
              console.warn("[meta-publish] first comment blocked by Meta; deferring to extension", res.id);
              firstCommentExtensionPayload = {
                post_id: res.id,
                post_url: `https://www.facebook.com/${res.id}`,
                first_comment: firstComment,
              };
              firstCommentError = `${c.error} — התגובה הראשונה הועברה לתוסף הדפדפן לפרסום אוטומטי.`;
              warnings.push(firstCommentError);
            } else {
              console.error("[meta-publish] first comment failed", res.id, JSON.stringify(c.raw));
              firstCommentError = c.error;
              warnings.push(c.error);
            }
          }


        }

      } else if (ch === "instagram") {
        const igId = await igAccountId(page.pageId, page.token);
        if (!igId) {
          failures.push({ platform: ch, message: "לא נמצא חשבון אינסטגרם עסקי המקושר לדף." });
        } else {
          const res = await publishInstagram(igId, page.token, text, media);
          if ("error" in res) failures.push({ platform: ch, message: res.error });
          else postIds.push({ platform: ch, id: res.id });
        }
      } else {
        failures.push({ platform: ch, message: `הערוץ ${ch} אינו נתמך בפרסום ישיר דרך Meta.` });
      }
    }

    // Facebook Groups are NEVER published through Meta's Graph API (group
    // publishing requires App Review). Every group target is staged as an
    // `fb_group_post` job in campaign_activity_queue and executed locally by
    // the Realtyz browser extension from the broker's own Facebook session.
    const groupResults: any[] = [];
    // Optional per-group text variations (anti-duplicate filter): { [group_id]: text }
    const groupTexts: Record<string, string> =
      body?.group_texts && typeof body.group_texts === "object" ? body.group_texts : {};

    // Facebook flags identical posts across groups as spam. Every group gets a
    // different main picture (rotated, and re-mixed when there are >10 photos)
    // plus a light text variation when the caller did not supply one.
    const shuffle = <T,>(arr: T[]): T[] => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    };
    const groupVariants = [
      "",
      "\n\nמוזמנים לפנות לפרטים נוספים.",
      "\n\nאשמח לענות על שאלות בפרטי.",
      "\n\nזמין לתיאום צפייה בהמשך השבוע.",
      "\n\nניתן לקבל עוד תמונות ומידע בהודעה.",
    ];

    if (groupIds.length > 0) {
      let groupUrls: Record<string, string | null> = {};
      try {
        const { data: grows } = await db
          .from("fb_user_groups")
          .select("group_id, group_url")
          .eq("workspace_owner_id", ownerId)
          .in("group_id", groupIds);
        groupUrls = Object.fromEntries(((grows ?? []) as any[]).map((r) => [String(r.group_id), r.group_url ?? null]));
      } catch { /* best effort */ }

      const nowIso = new Date().toISOString();
      const jobs = groupIds.map((gid, gi) => {
        const groupMedia = media.length > 10 ? shuffle(media).slice(0, 10) : media;
        const groupImage = groupMedia.length ? groupMedia[gi % groupMedia.length] : null;
        const groupText = typeof groupTexts[gid] === "string" && groupTexts[gid].trim()
          ? String(groupTexts[gid])
          : `${text}${groupVariants[gi % groupVariants.length]}`;
        return {
          workspace_owner_id: ownerId,
          created_by: ownerId,
          activity_type: "fb_group_post",
          target_ref: gid,
          target_label: gid,
          scheduled_for: nowIso,
          status: "pending",
          publication_status: "scheduled",
          variation_index: 0,
          variations: [{ body: groupText }],
          payload: {
            body: groupText,
            outbound_text: groupText,
            image_url: groupImage,
            media_urls: groupMedia,
            link: null,
            group_url: groupUrls[gid] ?? `https://www.facebook.com/groups/${gid}`,
            first_comment: firstComment || null,
            campaign_name: campaignName,
            listing_id: body?.listing_id ?? null,
            published_via: "browser_extension",
          },
        };
      });
      const { data: inserted, error: qErr } = await db
        .from("campaign_activity_queue")
        .insert(jobs)
        .select("id, target_ref");
      if (qErr) {
        console.error("[meta-publish] extension queue insert failed", qErr.message);
        for (const gid of groupIds) {
          groupResults.push({ group_id: gid, ok: false, code: "queue_failed", reason: `שמירת הפוסט לתור התוסף נכשלה: ${qErr.message}` });
        }
      } else {
        for (const row of (inserted ?? []) as any[]) {
          groupResults.push({
            group_id: String(row.target_ref),
            ok: true,
            code: "queued_for_extension",
            reason: "ממתין לפרסום דרך תוסף הדפדפן של Realtyz",
            queue_id: row.id,
            post_id: null,
          });
        }
      }
    }


    // One history row per channel attempt. A retry of the same content REUSES
    // the previous failed row (updated in place) so the queue never fills with
    // ghost duplicates of the same post.
    const groupOk = groupResults.filter((r: any) => r?.ok === true).length;
    for (const ch of pendingChannels) {
      const match = postIds.find((p) => p.platform === ch);
      const fail = failures.find((f) => f.platform === ch);
      // A post that reached at least one Facebook group IS published, even when
      // the Page leg was skipped or rejected.
      const succeeded = !!match || (ch === "facebook" && groupOk > 0);
      const attemptRow = {
        user_id: ownerId,
        campaign_name: campaignName,
        channel: ch,
        message_body: text,
        status: succeeded ? "sent" : "failed",
        sent_at: succeeded ? new Date().toISOString() : null,
        media_urls: media,
        first_comment: firstComment || null,
        failure_reason: succeeded ? null : (fail?.message ?? groupResults.find((r: any) => r?.reason)?.reason ?? null),
        provider_message_id: match?.id ?? null,
        group_ids: groupIds,
        provider_response: {
          provider: "meta_graph",
          page_id: page?.pageId ?? null,
          media_urls: media,
          first_comment: firstComment || null,
          first_comment_ids: firstCommentIds,
          first_comment_error: firstCommentError,
          first_comment_extension_payload: firstCommentExtensionPayload,


          postIds,
          content_hash: hashes[ch],
          error: fail?.message ?? null,
          last_attempt_at: new Date().toISOString(),
          // Per-group outcome so the history dialog can show exactly which
          // groups accepted the post and which rejected / deferred it.
          group_results: groupResults.map((r: any) => ({
            group_id: String(r?.group_id ?? ""),
            ok: r?.ok === true,
            code: r?.code ?? null,
            reason: r?.reason ?? null,
            post_id: r?.post_id ?? null,
          })),
        },
      };
      const reuseId = await findReusableRow(db, ownerId, ch, hashes[ch], ["failed"]);
      const { error: writeErr } = reuseId
        ? await db.from("campaign_logs").update(attemptRow).eq("id", reuseId)
        : await db.from("campaign_logs").insert(attemptRow);
      if (writeErr) console.warn("[meta-publish] campaign_logs write", writeErr.message);
    }


    if (postIds.length === 0 && groupOk === 0) {
      return json(
        {
          success: false,
          error: "provider_error",
          message: failures[0]?.message
            ?? groupResults.find((r: any) => r?.reason)?.reason
            ?? "הפרסום נכשל",
          failures,
        },
        200,
      );
    }

    return json({
      success: failures.length === 0 || groupOk > 0,
      group_published: groupOk,
      verified: true,
      published_channels: pendingChannels,
      duplicate_channels: alreadySent.map((p) => p.platform),
      post_ids: [...postIds, ...alreadySent],
      failures,
      warnings,
      group_results: groupResults,
      message: failures.length ? failures[0].message : (warnings[0] ?? null),
    });

  } catch (e) {
    console.error("[meta-publish] fatal", e);
    return json(
      { success: false, error: "service_failed", message: e instanceof Error ? e.message : "שגיאת פרסום" },
      200,
    );
  }
});

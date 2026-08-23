// meta-publish — direct Meta Graph API publishing for Facebook Pages and
// Instagram Business accounts.
//
// POST  { post|text, channels:['facebook'|'instagram'], campaign_name?, media_urls?,
//         scheduled_at?, workspace_owner_id?, group_ids?, first_comment?, action? }
// POST  { action: 'status' }              -> connection status (page + IG account)
// DELETE { external_post_id }             -> removes the post from Meta
//
// Credentials: public.messenger_page_bindings (page_id + page_access_token) for
// the workspace owner, with FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN env fallback.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

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

async function resolvePage(db: SupabaseClient, ownerId: string | null) {
  if (ownerId) {
    const { data } = await db
      .from("messenger_page_bindings")
      .select("page_id, page_name, page_access_token")
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row: any = data;
    if (row?.page_id && row?.page_access_token) {
      return { pageId: String(row.page_id), pageName: row.page_name ?? null, token: String(row.page_access_token) };
    }
  }
  const envId = Deno.env.get("FB_PAGE_ID")?.trim();
  const envToken = Deno.env.get("FB_PAGE_ACCESS_TOKEN")?.trim();
  if (envId && envToken) return { pageId: envId, pageName: null, token: envToken };
  return null;
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

/** Publish to a Facebook Page. Returns the post id. */
async function publishFacebook(
  pageId: string,
  token: string,
  message: string,
  media: string[],
  link: string | null,
): Promise<{ id: string } | { error: string }> {
  if (media.length === 0) {
    const form = new URLSearchParams({ message, access_token: token });
    if (link) form.set("link", link);
    const r = await graph(`/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: form.toString(),
    });
    if (!r.ok || !r.payload?.id) return { error: humanize(r.payload) };
    return { id: String(r.payload.id) };
  }

  if (media.length === 1) {
    const form = new URLSearchParams({ url: media[0], caption: message, access_token: token });
    const r = await graph(`/${pageId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: form.toString(),
    });
    if (!r.ok || !(r.payload?.post_id || r.payload?.id)) return { error: humanize(r.payload) };
    return { id: String(r.payload.post_id ?? r.payload.id) };
  }

  // Multi-photo: upload unpublished photos, then attach them to one feed post.
  const attached: string[] = [];
  for (const url of media.slice(0, 10)) {
    const form = new URLSearchParams({ url, published: "false", access_token: token });
    const r = await graph(`/${pageId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: form.toString(),
    });
    if (r.ok && r.payload?.id) attached.push(String(r.payload.id));
  }
  if (attached.length === 0) return { error: "העלאת התמונות לפייסבוק נכשלה" };
  const form = new URLSearchParams({ message, access_token: token });
  attached.forEach((id, i) => form.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));
  const r = await graph(`/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: form.toString(),
  });
  if (!r.ok || !r.payload?.id) return { error: humanize(r.payload) };
  return { id: String(r.payload.id) };
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db = admin();
  const body = await req.json().catch(() => ({} as any));

  try {
    const ownerId = await resolveOwner(req, body, db);
    if (!ownerId) return json({ success: false, error: "unauthorized", message: "יש להתחבר מחדש" }, 401);

    const page = await resolvePage(db, ownerId);

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

    // ---- Delete a live post ------------------------------------------------
    if (req.method === "DELETE" || body?.action === "delete") {
      const postId = String(body?.external_post_id ?? "").trim();
      if (!postId) return json({ success: false, error: "external_post_id is required" }, 400);
      if (!page) return json({ success: false, error: "not_connected", message: "דף הפייסבוק לא מחובר" }, 400);
      const r = await graph(`/${postId}?access_token=${encodeURIComponent(page.token)}`, { method: "DELETE" });
      if (!r.ok) return json({ success: false, error: humanize(r.payload, "מחיקת הפוסט מפייסבוק נכשלה") }, 200);
      return json({ success: true });
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
    const firstComment = String(body?.first_comment ?? "").trim();
    const groupIds: string[] = (Array.isArray(body?.group_ids) ? body.group_ids : []).map((g: unknown) => String(g));

    if (!text && media.length === 0) {
      return json({ success: false, error: "empty_post", message: "אין תוכן לפרסום" }, 200);
    }

    // Scheduled posts are persisted and dispatched later by the queue drain.
    if (scheduledIso) {
      await db.from("campaign_logs").insert(
        channels.map((ch) => ({
          user_id: ownerId,
          campaign_name: campaignName,
          channel: ch,
          message_body: text,
          status: "scheduled",
          sent_at: scheduledIso,
          media_urls: media,
          first_comment: firstComment || null,
          provider_response: { provider: "meta_graph", scheduled_at: scheduledIso },
        })),
      );
      return json({ success: true, verified: true, scheduled: true, post_ids: [] });
    }

    if (!page) {
      return json(
        {
          success: false,
          error: "not_connected",
          message: "דף הפייסבוק לא מחובר. יש לחבר את דף הפייסבוק בהגדרות החיבורים.",
        },
        200,
      );
    }

    const postIds: Array<{ platform: string; id: string }> = [];
    const failures: Array<{ platform: string; message: string }> = [];

    for (const ch of channels) {
      if (ch === "facebook") {
        const res = await publishFacebook(page.pageId, page.token, text, media, link);
        if ("error" in res) failures.push({ platform: ch, message: res.error });
        else {
          postIds.push({ platform: ch, id: res.id });
          if (firstComment) {
            const form = new URLSearchParams({ message: firstComment, access_token: page.token });
            await graph(`/${res.id}/comments`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
              body: form.toString(),
            });
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

    // Facebook Groups fan-out stays on the personal-profile publisher.
    const groupResults: any[] = [];
    // Optional per-group text variations (anti-duplicate filter): { [group_id]: text }
    const groupTexts: Record<string, string> =
      body?.group_texts && typeof body.group_texts === "object" ? body.group_texts : {};
    for (const gid of groupIds) {
      const groupText = typeof groupTexts[gid] === "string" && groupTexts[gid].trim()
        ? String(groupTexts[gid])
        : text;
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/fb-group-publish`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ group_id: gid, message: groupText, image_url: media[0] ?? null, workspace_owner_id: ownerId }),
      })
        .then((r) => r.json())
        .catch((e) => ({ ok: false, reason: String(e) }));
      groupResults.push({ group_id: gid, ...r });
    }

    const rows = channels.map((ch) => {
      const match = postIds.find((p) => p.platform === ch);
      const fail = failures.find((f) => f.platform === ch);
      return {
        user_id: ownerId,
        campaign_name: campaignName,
        channel: ch,
        message_body: text,
        status: match ? "sent" : "failed",
        sent_at: match ? new Date().toISOString() : null,
        media_urls: media,
        first_comment: firstComment || null,
        failure_reason: fail?.message ?? null,
        provider_message_id: match?.id ?? null,
        provider_response: {
          provider: "meta_graph",
          page_id: page.pageId,
          media_urls: media,
          first_comment: firstComment || null,
          postIds,
          error: fail?.message ?? null,
        },
      };
    });
    const { error: insErr } = await db.from("campaign_logs").insert(rows);
    if (insErr) console.warn("[meta-publish] campaign_logs insert", insErr.message);

    if (postIds.length === 0) {
      return json(
        {
          success: false,
          error: "provider_error",
          message: failures[0]?.message ?? "הפרסום נכשל",
          failures,
        },
        200,
      );
    }

    return json({
      success: failures.length === 0,
      verified: true,
      published_channels: channels,
      post_ids: postIds,
      failures,
      group_results: groupResults,
      message: failures.length ? failures[0].message : null,
    });
  } catch (e) {
    console.error("[meta-publish] fatal", e);
    return json(
      { success: false, error: "service_failed", message: e instanceof Error ? e.message : "שגיאת פרסום" },
      200,
    );
  }
});

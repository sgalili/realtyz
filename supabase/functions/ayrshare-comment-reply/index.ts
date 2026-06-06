// Realtyz ayrshare-comment-reply — publishes a reply to a native social
// comment via Ayrshare. Reads/writes the engagement_events row scoped to the
// owning user_id (workspace_social_profile is the single workspace profile).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sanitizeOutboundText, resolveWorkspaceProfileKey, likeNativeComment } from "../_shared/ayrshare-helpers.ts";

const AYR_REPLY_URL = "https://api.ayrshare.com/api/comments/reply";
const AYR_MESSAGES_URL = "https://api.ayrshare.com/api/messages";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  try {
    const AYRSHARE_API_KEY = Deno.env.get("AYRSHARE_API_KEY");
    if (!AYRSHARE_API_KEY) return json({ error: "AYRSHARE_API_KEY not configured" }, 500);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const eventId: string | undefined = body?.event_id;
    const overrideText: string | undefined = body?.comment;
    const platformOverride: string | undefined = body?.platform;
    const overrideCommentId: string | undefined = body?.comment_id;
    const explicitUserId: string | undefined = body?.user_id;
    const privateDmRaw: string | undefined = typeof body?.private_dm === "string" ? body.private_dm : undefined;

    if (!eventId && !overrideCommentId) return json({ error: "missing event_id or comment_id" }, 400);

    let nativeCommentId = overrideCommentId || "";
    let replyText = overrideText || "";
    let platform = platformOverride || "facebook";
    let rowId: string | null = null;
    let ownerUserId: string | null = explicitUserId || null;
    let rowMetadata: Record<string, unknown> = {};

    if (eventId) {
      const { data: row, error } = await admin
        .from("engagement_events")
        .select("id, user_id, external_id, platform, ai_reply_text, metadata")
        .eq("id", eventId)
        .maybeSingle();
      if (error || !row) return json({ error: "event not found", details: error?.message }, 404);
      rowId = row.id;
      ownerUserId = row.user_id || ownerUserId;
      nativeCommentId = row.external_id || "";
      replyText = replyText || row.ai_reply_text || "";
      platform = platformOverride || row.platform || platform;
      rowMetadata = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
    }

    if (!ownerUserId) {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      if (token) {
        try {
          const { data } = await admin.auth.getUser(token);
          ownerUserId = data?.user?.id ?? null;
        } catch { /* ignore */ }
      }
    }
    if (!ownerUserId) return json({ error: "user_id required" }, 401);
    if (!nativeCommentId) return json({ error: "missing native commentId" }, 400);
    const sanitized = sanitizeOutboundText(replyText);
    if (!sanitized) return json({ error: "missing reply text" }, 400);

    const { profileKey } = await resolveWorkspaceProfileKey(admin);
    if (!profileKey) return json({ error: "workspace ayrshare profile key missing" }, 500);

    const ayrRes = await fetch(AYR_REPLY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platforms: [platform],
        commentId: nativeCommentId,
        comment: sanitized,
        reply: sanitized,
        profileKey,
        searchPlatformId: true,
      }),
    });
    const ayrText = await ayrRes.text();
    let ayrPayload: any = null;
    try { ayrPayload = ayrText ? JSON.parse(ayrText) : null; } catch { ayrPayload = { raw: ayrText }; }

    if (!ayrRes.ok) {
      if (rowId) {
        await admin
          .from("engagement_events")
          .update({ status: "failed", metadata: { ...rowMetadata, reply_error: ayrPayload } })
          .eq("id", rowId)
          .eq("user_id", ownerUserId);
      }
      return json({ error: "ayrshare reply failed", status: ayrRes.status, details: ayrPayload }, 502);
    }

    // Parallel ALGO BOOST + DM: Auto-Like the original comment and (optionally)
    // send a private Messenger / IG Direct DM. Both run concurrently and never
    // block or fail the public reply that just succeeded.
    const sanitizedDm = sanitizeOutboundText(privateDmRaw ?? "");
    const dmTask = sanitizedDm
      ? fetch(AYR_MESSAGES_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${AYRSHARE_API_KEY}`,
            "Profile-Key": profileKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            platforms: [platform],
            commentId: nativeCommentId,
            message: sanitizedDm,
            searchPlatformId: true,
          }),
        }).then(async (r) => {
          const t = await r.text();
          let p: any; try { p = t ? JSON.parse(t) : { ok: r.ok }; } catch { p = { raw: t, ok: r.ok }; }
          return { status: r.status, response: p };
        }).catch((e) => ({ status: 0, response: { error: e instanceof Error ? e.message : String(e) } }))
      : Promise.resolve(null);

    const likeTask = likeNativeComment({
      apiKey: AYRSHARE_API_KEY,
      profileKey,
      platform,
      commentId: nativeCommentId,
    });

    const [dmOutcome, likeOutcome] = await Promise.all([dmTask, likeTask]);
    const privateDmResult = dmOutcome?.response ?? null;
    const privateDmStatus = dmOutcome?.status ?? null;
    const privateDmSent = sanitizedDm
      ? (privateDmStatus !== null && privateDmStatus >= 200 && privateDmStatus < 300)
      : false;
    if (!likeOutcome.ok) {
      console.warn("[ayrshare-comment-reply] auto-like non-fatal failure", likeOutcome);
    }

    if (rowId) {
      await admin
        .from("engagement_events")
        .update({
          status: "sent",
          ai_reply_text: sanitized,
          metadata: {
            ...rowMetadata,
            ayrshare_reply: ayrPayload,
            ...(sanitizedDm
              ? { private_dm: { status: privateDmStatus, response: privateDmResult, text: sanitizedDm } }
              : {}),
            auto_like: likeOutcome,
          },
        })
        .eq("id", rowId)
        .eq("user_id", ownerUserId);
    }


    return json({
      success: true,
      commentId: nativeCommentId,
      ayrshare: ayrPayload,
      private_dm_sent: privateDmSent,
      private_dm: privateDmResult,
      private_dm_status: privateDmStatus,
      auto_like: likeOutcome,
    });
  } catch (e) {
    console.error("[ayrshare-comment-reply] error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

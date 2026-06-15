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
    const skipPublicReply: boolean = body?.skip_public_reply === true;

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
    const sanitized = skipPublicReply ? "" : sanitizeOutboundText(replyText);
    if (!skipPublicReply && !sanitized) return json({ error: "missing reply text" }, 400);
    if (skipPublicReply && !(privateDmRaw && privateDmRaw.trim())) {
      return json({ error: "skip_public_reply requires private_dm text" }, 400);
    }

    const { profileKey } = await resolveWorkspaceProfileKey(admin);
    if (!profileKey) return json({ error: "workspace ayrshare profile key missing" }, 500);

    let ayrPayload: any = null;
    if (!skipPublicReply) {
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
      try { ayrPayload = ayrText ? JSON.parse(ayrText) : null; } catch { ayrPayload = { raw: ayrText }; }

      if (!ayrRes.ok) {
        if (rowId) {
          await admin
            .from("engagement_events")
            .update({ status: "failed", metadata: { ...rowMetadata, reply_error: ayrPayload } })
            .eq("id", rowId)
            .eq("user_id", ownerUserId);
        }
        // Hard-stop: 429 / 403 means Ayrshare wants us to back off NOW.
        // Surface `halt` so the client immediately freezes — no retries.
        const halt = ayrRes.status === 429 || ayrRes.status === 403;
        return json({
          error: ayrRes.status === 429 ? "RATE_LIMIT_EXCEEDED" : "ayrshare reply failed",
          status: ayrRes.status,
          details: ayrPayload,
          halt,
          rate_limited: ayrRes.status === 429,
          suspended: ayrRes.status === 403,
        }, 200);
      }
    }

    // STRICT SEQUENTIAL EXECUTION:
    // 1) Public reply has already returned above — extract Ayrshare's fresh
    //    native comment id from its payload (variable shape per platform).
    // 2) THEN dispatch the private Messenger / IG Direct DM, binding to the
    //    inbound commenter's original external_id as the parent routing key
    //    (Meta requires the user's comment id, not our reply id, to authorize
    //    the private inbox pop-up). The fresh reply id is logged for traceability.
    const extractFreshId = (payload: any): string | null => {
      if (!payload || typeof payload !== "object") return null;
      const direct =
        payload?.id ||
        payload?.commentId ||
        payload?.reply?.id ||
        payload?.[platform]?.id ||
        payload?.[platform]?.commentId ||
        null;
      if (typeof direct === "string" && direct.trim()) return direct.trim();
      const arr = Array.isArray(payload?.postIds) ? payload.postIds : [];
      const fromArr = arr.find((p: any) => typeof p?.id === "string");
      return typeof fromArr?.id === "string" ? fromArr.id.trim() : null;
    };
    const freshReplyId = extractFreshId(ayrPayload);
    // Parent routing key for the private DM: prefer the inbound user's
    // external_id (engagement_events.external_id), fall back to the verified
    // reply id only if the source row had none.
    const dmParentId = nativeCommentId || freshReplyId || "";
    console.log(
      `[MESSENGER PIPELINE] Directing private DM for listing הבשן 3 to comment ID: ${dmParentId}` +
      ` (fresh_reply_id=${freshReplyId ?? "none"})`,
    );

    const sanitizedDm = sanitizeOutboundText(privateDmRaw ?? "");
    let privateDmResult: any = null;
    let privateDmStatus: number | null = null;
    if (sanitizedDm && dmParentId) {
      // ALL outbound traffic — public reply AND private DM — is routed
      // exclusively through Ayrshare. We never call graph.facebook.com
      // directly: Meta Page tokens expire and Ayrshare maintains the live
      // token + private-reply authorization on our behalf.
      try {
        // Ayrshare Messenger / IG Direct PRIVATE REPLY contract:
        // POST /api/messages with `commentId` (NOT recipientId, which expects a PSID).
        // Meta authorizes the Page → user thread because the comment author is
        // resolved from the commentId server-side.
        const dmRes = await fetch("https://api.ayrshare.com/api/messages", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${AYRSHARE_API_KEY}`,
            "Profile-Key": profileKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            platforms: [platform],
            commentId: dmParentId,
            message: sanitizedDm,
            searchPlatformId: true,
          }),
        });
        privateDmStatus = dmRes.status;
        const dmText = await dmRes.text();
        try { privateDmResult = dmText ? JSON.parse(dmText) : { ok: dmRes.ok }; }
        catch { privateDmResult = { raw: dmText, ok: dmRes.ok }; }
        const ayrStatus = (privateDmResult && typeof privateDmResult === "object")
          ? String((privateDmResult as any).status ?? "").toLowerCase() : "";
        if (dmRes.ok && ayrStatus && ayrStatus !== "success") {
          // Ayrshare returned HTTP 200 but logical error — surface it.
          console.warn("[MESSENGER PIPELINE] Ayrshare logical error on DM", privateDmResult);
        }
        console.log("[MESSENGER PIPELINE] Ayrshare DM result", { status: privateDmStatus, platform, commentId: dmParentId, response: privateDmResult });
      } catch (e) {
        privateDmResult = { error: e instanceof Error ? e.message : String(e) };
        console.error("[MESSENGER PIPELINE] DM dispatch threw", privateDmResult);
      }
    }
    const ayrLogicalStatus = (privateDmResult && typeof privateDmResult === "object")
      ? String((privateDmResult as any).status ?? "").toLowerCase() : "";
    const privateDmSent = sanitizedDm
      ? (privateDmStatus !== null && privateDmStatus >= 200 && privateDmStatus < 300 && (!ayrLogicalStatus || ayrLogicalStatus === "success"))
      : false;

    // Auto-Like runs after the DM completes — non-fatal regardless of outcome.
    const likeOutcome = await likeNativeComment({
      apiKey: AYRSHARE_API_KEY,
      profileKey,
      platform,
      commentId: nativeCommentId,
    });
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

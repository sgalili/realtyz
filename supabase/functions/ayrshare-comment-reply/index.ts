// Realtyz ayrshare-comment-reply — publishes a reply to a native social
// comment via Ayrshare. Reads/writes the engagement_events row scoped to the
// owning user_id (workspace_social_profile is the single workspace profile).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sanitizeOutboundText, resolveWorkspaceProfileKey, likeNativeComment } from "../_shared/ayrshare-helpers.ts";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const AYR_REPLY_URL = "https://api.ayrshare.com/api/comments/reply";
const AYR_MESSAGES_URL = "https://api.ayrshare.com/api/messages";
const MESSENGER_RELINK_MESSAGE = "Facebook Messenger DM is blocked by Meta permissions. Re-link the Facebook Page and approve messaging/private-reply permissions.";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function flattenErrorBlob(raw: string, payload: unknown): string {
  return `${raw || ""}\n${JSON.stringify(payload ?? {})}`;
}

function isMetaPermissionBlock(status: number | null, raw: string, payload: unknown): boolean {
  const blob = flattenErrorBlob(raw, payload);
  return /requires\s+.*permission|pages_messaging|instagram_manage_messages|pages_manage_metadata|missing\s+permissions?|unsupported\s+post\s+request|oauth(exception)?|invalid\s+or\s+expired\s+token|access\s+token\s+.*expired|not\s+authorized|permission\s+.*not\s+granted|application\s+does\s+not\s+have\s+the\s+capability|messag(e|ing).*permission|private\s+reply.*permission|\(#200\)|\(#10\)/i.test(blob) || status === 401 || status === 403;
}

function isDuplicatePrivateReply(raw: string, payload: unknown): boolean {
  return /already\s+(been\s+)?sent|private reply.*sent|duplicate|messag(e|ing).*already/i.test(flattenErrorBlob(raw, payload));
}

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
    const profileKeyFingerprint = `${profileKey.slice(0, 4)}…${profileKey.slice(-4)}`;

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
    console.log("[MESSENGER PIPELINE] Directing private DM", {
      eventId: rowId,
      commentId: dmParentId,
      freshReplyId: freshReplyId ?? "none",
      platform: "facebook",
      profileKey: profileKeyFingerprint,
    });

    const sanitizedDm = sanitizeOutboundText(privateDmRaw ?? "");
    let privateDmResult: any = null;
    let privateDmStatus: number | null = null;
    let privateDmPermissionBlock = false;
    let privateDmDuplicate = false;
    let privateDmEmptySuccess = false;
    if (sanitizedDm && dmParentId) {
      // ALL outbound traffic — public reply AND private DM — is routed
      // exclusively through Ayrshare. We never call graph.facebook.com
      // directly: Meta Page tokens expire and Ayrshare maintains the live
      // token + private-reply authorization on our behalf.
      try {
        // Ayrshare Messenger PRIVATE REPLY contract:
        // POST /api/messages with the exact Meta private-reply fields.
        // `platform: "facebook"` is mandatory; without it Ayrshare may treat
        // the payload as a direct user-id message instead of a comment reply.
        // Meta authorizes the Page → user thread because the comment author is
        // resolved from the commentId server-side.
        const dmBody = {
          commentId: dmParentId,
          text: sanitizedDm,
          platform: "facebook",
        };
        console.log("[MESSENGER PIPELINE] Ayrshare DM request", {
          commentId: dmParentId,
          platform: "facebook",
          profileKey: profileKeyFingerprint,
          textLength: sanitizedDm.length,
        });
        const dmRes = await fetch(AYR_MESSAGES_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${AYRSHARE_API_KEY}`,
            "Profile-Key": profileKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(dmBody),
        });
        privateDmStatus = dmRes.status;
        const dmText = await dmRes.text();
        privateDmEmptySuccess = dmRes.ok && !dmText.trim();
        console.log("[MESSENGER PIPELINE] Ayrshare DM raw response", {
          status: privateDmStatus,
          commentId: dmParentId,
          platform: "facebook",
          raw: dmText,
        });
        if (!dmRes.ok) {
          console.error("[MESSENGER PIPELINE] Ayrshare DM HTTP error", {
            status: privateDmStatus,
            commentId: dmParentId,
            platform: "facebook",
            raw: dmText,
          });
        }
        try { privateDmResult = dmText ? JSON.parse(dmText) : { ok: dmRes.ok }; }
        catch { privateDmResult = { raw: dmText, ok: dmRes.ok }; }
        privateDmDuplicate = isDuplicatePrivateReply(dmText, privateDmResult);
        privateDmPermissionBlock = isMetaPermissionBlock(privateDmStatus, dmText, privateDmResult);
        if (privateDmDuplicate) {
          console.log(`[MESSENGER DUP] DM locked by Meta for this specific commentId: ${dmParentId}`);
        }
        if (privateDmEmptySuccess) {
          console.warn("[MESSENGER DELIVERY UNKNOWN] Ayrshare returned HTTP success with an empty DM payload", {
            status: privateDmStatus,
            commentId: dmParentId,
            platform: "facebook",
            profileKey: profileKeyFingerprint,
          });
          await logIntegrationError({
            integration: "ayrshare",
            functionName: "ayrshare-comment-reply",
            errorCode: "MESSENGER_EMPTY_SUCCESS_PAYLOAD",
            errorMessage: "Ayrshare returned HTTP success with an empty Messenger DM payload; delivery is not confirmed.",
            context: { eventId: rowId, commentId: dmParentId, platform: "facebook", status: privateDmStatus },
          });
        }
        if (privateDmPermissionBlock) {
          console.error("[MESSENGER PERMISSION BLOCK] Re-authentication required. Please re-link the Facebook Page.", {
            status: privateDmStatus,
            commentId: dmParentId,
            platform: "facebook",
            raw: dmText,
            response: privateDmResult,
          });
          await logIntegrationError({
            integration: "ayrshare",
            functionName: "ayrshare-comment-reply",
            errorCode: "MESSENGER_PERMISSION_BLOCK",
            errorMessage: flattenErrorBlob(dmText, privateDmResult).slice(0, 1800) || MESSENGER_RELINK_MESSAGE,
            context: { eventId: rowId, commentId: dmParentId, platform: "facebook", status: privateDmStatus },
          });
          await admin
            .from("social_connections")
            .update({
              last_test_status: "failed",
              last_test_message: MESSENGER_RELINK_MESSAGE,
              last_test_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .ilike("platform", "facebook%");
          await admin.from("notifications").insert({
            user_id: ownerUserId,
            event_type: "critical_question",
            title: "Messenger DM permission blocked",
            body: `${MESSENGER_RELINK_MESSAGE}\nRaw Ayrshare response: ${(dmText || JSON.stringify(privateDmResult)).slice(0, 700)}`,
            deep_link: `${Deno.env.get("APP_PUBLIC_URL") || "https://realtyz.co.il"}/campaigns?tab=create`,
            channel: "system",
            delivered: false,
            delivery_result: { source: "ayrshare-comment-reply", relink_required: true, status: privateDmStatus },
          });
          privateDmResult = {
            ...(privateDmResult && typeof privateDmResult === "object" ? privateDmResult : { raw: dmText }),
            error_type: "MESSENGER_PERMISSION_ERROR",
            message: MESSENGER_RELINK_MESSAGE,
            fallback: true,
            relink_required: true,
          };
        }
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
      ? (privateDmStatus !== null && privateDmStatus >= 200 && privateDmStatus < 300 && !privateDmPermissionBlock && !privateDmEmptySuccess && (!ayrLogicalStatus || ayrLogicalStatus === "success"))
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

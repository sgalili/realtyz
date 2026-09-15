// meta-comments-webhook — realtime Facebook Page comment notifications.
//
// Meta setup (Webhooks → Page): subscribe the Page to the `feed` field and
// point the callback URL at this function.
//   GET  → hub.challenge verification (token = META_COMMENTS_VERIFY_TOKEN,
//          falling back to the shared VERIFY_TOKEN secrets)
//   POST → entry[].changes[] with field="feed", item="comment" are hydrated
//          from the Graph API and stored instantly in engagement_events
//          (plus fb_comments for tracked posts).
//
// Public endpoint: Meta cannot send an Authorization header, so this function
// authenticates the payload with the verify token / app secret instead.
import { corsHeaders } from "../_shared/cors.ts";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";
import { graphCall, metaAdminClient, ownerForPage } from "../_shared/metaPage.ts";
import {
  COMMENT_FIELDS,
  persistComment,
  persistTrackedComments,
  safeStr,
  toFlatComment,
  type FlatComment,
} from "../_shared/metaComments.ts";
import { isOwnPageAuthor } from "../_shared/metaPage.ts";
import { privateReplyConfig, sendPrivateReply } from "../_shared/metaPrivateReply.ts";

/**
 * Comment → private Messenger DM.
 * Runs at most once per comment, never for our own Page/AI comments, and never
 * breaks the webhook: every Meta rejection is logged and swallowed.
 */
async function maybePrivateReply(
  admin: any,
  binding: { ownerId: string; pageId: string; pageName: string | null; token: string },
  flat: FlatComment,
): Promise<void> {
  try {
    if (isOwnPageAuthor(flat.fromId, flat.fromName, { pageId: binding.pageId, pageName: binding.pageName })) return;

    const { data: row } = await admin
      .from("engagement_events")
      .select("id, metadata, lead_id")
      .eq("user_id", binding.ownerId)
      .eq("external_id", flat.id)
      .maybeSingle();
    const meta = (row?.metadata && typeof row.metadata === "object") ? row.metadata as Record<string, unknown> : {};
    if (meta.private_reply) return;           // one attempt per comment, ever
    if (meta.is_ai_reply) return;

    const cfg = await privateReplyConfig(admin, binding.ownerId);
    if (!cfg.enabled) return;

    const outcome = await sendPrivateReply(
      { pageId: binding.pageId, pageName: binding.pageName, token: binding.token } as any,
      flat.id,
      cfg.text,
    );

    if (row?.id) {
      await admin
        .from("engagement_events")
        .update({
          metadata: {
            ...meta,
            private_reply: {
              ok: outcome.ok,
              at: new Date().toISOString(),
              ...(outcome.ok
                ? { via: outcome.via, message_id: outcome.messageId }
                : { reason: outcome.reason, error: outcome.error, code: outcome.code }),
            },
          },
        })
        .eq("id", row.id)
        .eq("user_id", binding.ownerId);
    }

    if (!outcome.ok) {
      await logIntegrationError({
        integration: "meta",
        functionName: "meta-comments-webhook",
        errorMessage: `private_reply_${outcome.reason}: ${outcome.error}`,
        context: { comment_id: flat.id, page_id: binding.pageId, code: outcome.code, subcode: outcome.subcode },
      });
      return;
    }

    // Mirror the outbound DM into the inbox thread when we know the contact.
    if (row?.lead_id) {
      await admin.from("messages").insert({
        lead_id: row.lead_id,
        content: cfg.text,
        direction: "outbound",
        sender_type: "ai",
        channel: "messenger",
        platform: "messenger",
        metadata: {
          meta_message_id: outcome.messageId,
          source: "comment_private_reply",
          comment_id: flat.id,
          page_id: binding.pageId,
        },
      } as any);
    }
  } catch (e) {
    console.error("[meta-comments-webhook] private reply failed", e);
  }
}

const verifyToken = () =>
  Deno.env.get("META_COMMENTS_VERIFY_TOKEN") ??
  Deno.env.get("WA_VERIFY_TOKEN") ??
  Deno.env.get("VERIFY_TOKEN") ??
  Deno.env.get("META_WA_VERIFY_TOKEN") ??
  Deno.env.get("MESSENGER_VERIFY_TOKEN") ??
  null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ---- Meta subscription handshake ----------------------------------------
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    const expected = verifyToken();
    if (mode === "subscribe" && expected && token === expected) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method", { status: 405 });

  // Always ACK fast: Meta retries and disables endpoints that error or stall.
  let payload: any = null;
  try { payload = await req.json(); } catch { payload = null; }

  const process = async () => {
    try {
      const admin = metaAdminClient();
      const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : [];
      for (const entry of entries) {
        const pageId = safeStr(entry?.id, 100);
        if (!pageId) continue;
        const binding = await ownerForPage(admin, pageId);
        if (!binding?.token) {
          console.warn("[meta-comments-webhook] no binding for page", pageId);
          continue;
        }
        const page = { pageId: binding.pageId, pageName: binding.pageName };

        for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
          if (String(change?.field ?? "") !== "feed") continue;
          const value: any = change?.value ?? {};
          if (String(value?.item ?? "") !== "comment") continue;
          const verb = String(value?.verb ?? "add");
          const commentId = safeStr(value?.comment_id, 200);
          const postId = safeStr(value?.post_id, 200) ?? safeStr(value?.parent_id, 200) ?? "";
          if (!commentId) continue;

          if (verb === "remove") {
            const { data: removed } = await admin
              .from("engagement_events")
              .update({ is_archived: true })
              .eq("user_id", binding.ownerId)
              .eq("external_id", commentId)
              .select("id");
            const parentIds = new Set<string>([commentId, ...((removed ?? []).map((row: any) => String(row.id)))]);
            let changed = true;
            while (changed) {
              changed = false;
              const { data: candidates } = await admin
                .from("engagement_events")
                .select("id, external_id, metadata")
                .eq("user_id", binding.ownerId)
                .eq("platform", "facebook")
                .eq("is_archived", false)
                .limit(2000);
              const childIds = (candidates ?? []).filter((row: any) => {
                const parent = safeStr(row?.metadata?.parent_id, 200) ?? safeStr(row?.metadata?.parent_event_id, 200);
                return !!parent && parentIds.has(parent);
              });
              if (childIds.length > 0) {
                await admin.from("engagement_events").update({ is_archived: true }).in("id", childIds.map((row: any) => row.id));
                for (const row of childIds) {
                  const external = safeStr(row?.external_id, 200);
                  if (external && !parentIds.has(external)) { parentIds.add(external); changed = true; }
                  parentIds.add(String(row.id));
                }
              }
            }
            await admin.from("fb_comments").delete().eq("ayr_comment_id", commentId);
            continue;
          }

          // Hydrate the full comment node so we get the author avatar, the
          // parent id and the like count (the webhook payload is minimal).
          const r = await graphCall(
            `/${commentId}?fields=${encodeURIComponent(COMMENT_FIELDS)}&access_token=${encodeURIComponent(binding.token)}`,
          );
          let flat: FlatComment | null = r.ok ? toFlatComment(r.payload, postId) : null;
          if (!flat) {
            // Graceful degradation: store what the webhook itself gave us.
            flat = {
              id: commentId,
              postId,
              parentId: safeStr(value?.parent_id, 200) === postId ? null : safeStr(value?.parent_id, 200),
              text: safeStr(value?.message, 4000) ?? "",
              fromId: safeStr(value?.from?.id, 200),
              fromName: safeStr(value?.from?.name, 200),
              avatar: null,
              createdAt: value?.created_time
                ? new Date(Number(value.created_time) * 1000).toISOString()
                : new Date().toISOString(),
              likeCount: 0,
              permalink: null,
              raw: value,
            };
          }

          await persistComment(admin, binding.ownerId, page, flat, "meta_comments_webhook");

          // Keep the HITL board in sync when the post is tracked.
          const { data: tracked } = await admin
            .from("fb_engagement_posts")
            .select("id, fb_post_id");
          const match = (tracked ?? []).find((row: any) => {
            const native = String(row?.fb_post_id ?? "");
            return !!native && (native === flat!.postId || flat!.postId.endsWith(`_${native}`));
          });
          if (match) await persistTrackedComments(admin, String((match as any).id), [flat], page);

          // Comment → private Messenger DM (opt-in per workspace).
          await maybePrivateReply(admin, binding as any, flat);
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[meta-comments-webhook] processing failed", message, e instanceof Error ? e.stack : "");
      await logIntegrationError({
        integration: "meta",
        functionName: "meta-comments-webhook",
        errorMessage: `${message}${e instanceof Error && e.stack ? `\n${e.stack}` : ""}`,
        context: { object: payload?.object ?? null },
      });
    }
  };

  // @ts-ignore Deno-specific background task API.
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(process());
  else await process();

  return new Response("EVENT_RECEIVED", { status: 200 });
});

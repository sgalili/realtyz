// metaPrivateReply — turn a public Facebook Page comment into a private
// Messenger conversation with the commenter.
//
// Primary call : POST /{comment-id}/private_replies  (Page token)
// Fallback     : POST /{page-id}/messages with recipient { comment_id }
//
// Meta rules we respect here:
//   * private replies only work for comments on Page posts, once per comment,
//     and only within 7 days of the comment.
//   * `pages_messaging` must be granted (live mode) — in Development mode the
//     Graph API rejects anyone who is not a tester of the app.
// Every rejection is classified and returned as data; the caller logs it and
// keeps ACKing the webhook so Meta never disables the endpoint.
import { GRAPH, humanizeMetaError, type MetaPage } from "./metaPage.ts";

export const DEFAULT_PRIVATE_REPLY =
  "היי! תודה על התגובה 🙏 אשמח לענות על כל שאלה על הנכס כאן במסנג'ר, או בוואטסאפ: 053-7983832";

export type PrivateReplyOutcome =
  | { ok: true; messageId: string | null; via: "private_replies" | "send_api" }
  | {
    ok: false;
    reason:
      | "permission_missing"
      | "already_replied"
      | "window_expired"
      | "not_eligible"
      | "unknown";
    error: string;
    code: number | null;
    subcode: number | null;
    status: number;
  };

const post = async (url: string, body: Record<string, unknown>) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let payload: any = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = { raw }; }
  return { ok: res.ok, status: res.status, payload };
};

type FailReason = Extract<PrivateReplyOutcome, { ok: false }>["reason"];

const classify = (payload: any): FailReason => {
  const err = payload?.error ?? {};
  const code = Number(err.code ?? 0);
  const sub = Number(err.error_subcode ?? 0);
  const msg = String(err.message ?? "").toLowerCase();

  if (sub === 2018108 || msg.includes("already been sent") || msg.includes("already replied")) {
    return "already_replied";
  }
  if (code === 10 || code === 200 || code === 190 || msg.includes("permission")) {
    return "permission_missing";
  }
  if (sub === 2018278 || msg.includes("outside") || msg.includes("expired") || msg.includes("7 day")) {
    return "window_expired";
  }
  if (code === 100 || msg.includes("not eligible") || msg.includes("cannot reply")) {
    return "not_eligible";
  }
  return "unknown";
};

/** Send one private Messenger reply to the author of a Page comment. */
export async function sendPrivateReply(
  page: MetaPage,
  commentId: string,
  text: string,
): Promise<PrivateReplyOutcome> {
  const message = String(text ?? "").trim().slice(0, 2000);
  if (!commentId || !message) {
    return { ok: false, reason: "not_eligible", error: "חסר מזהה תגובה או תוכן הודעה", code: null, subcode: null, status: 400 };
  }

  const primary = await post(
    `${GRAPH}/${encodeURIComponent(commentId)}/private_replies`,
    { message, access_token: page.token },
  );
  if (primary.ok) {
    return {
      ok: true,
      via: "private_replies",
      messageId: primary.payload?.id ? String(primary.payload.id) : null,
    };
  }

  const primaryReason = classify(primary.payload);
  // The Send API accepts `recipient: { comment_id }` and sometimes succeeds
  // where the comment edge fails (older posts, shared Page bindings).
  if (primaryReason === "not_eligible" || primaryReason === "unknown") {
    const fallback = await post(`${GRAPH}/${page.pageId}/messages`, {
      recipient: { comment_id: commentId },
      message: { text: message },
      messaging_type: "RESPONSE",
      access_token: page.token,
    });
    if (fallback.ok) {
      return {
        ok: true,
        via: "send_api",
        messageId: fallback.payload?.message_id ? String(fallback.payload.message_id) : null,
      };
    }
    return {
      ok: false,
      reason: classify(fallback.payload),
      error: humanizeMetaError(fallback.payload, "שליחת הודעה פרטית למגיב נכשלה"),
      code: fallback.payload?.error?.code ?? null,
      subcode: fallback.payload?.error?.error_subcode ?? null,
      status: fallback.status,
    };
  }

  return {
    ok: false,
    reason: primaryReason,
    error: humanizeMetaError(primary.payload, "שליחת הודעה פרטית למגיב נכשלה"),
    code: primary.payload?.error?.code ?? null,
    subcode: primary.payload?.error?.error_subcode ?? null,
    status: primary.status,
  };
}

/** Per-workspace switch + custom copy, stored in platform_settings.extra. */
export async function privateReplyConfig(
  admin: any,
  ownerId: string,
): Promise<{ enabled: boolean; text: string }> {
  const { data } = await admin
    .from("platform_settings")
    .select("extra, ai_paused")
    .eq("user_id", ownerId)
    .maybeSingle();
  const extra = (data?.extra && typeof data.extra === "object") ? data.extra as Record<string, unknown> : {};
  const custom = String(extra.comment_dm_text ?? "").trim();
  return {
    enabled: Boolean(extra.auto_dm_commenters) && !data?.ai_paused,
    text: custom || DEFAULT_PRIVATE_REPLY,
  };
}

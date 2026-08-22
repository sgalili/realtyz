// Shared direct-messaging helpers for the official Meta Messaging APIs.
//
// Facebook Messenger : POST /{page-id}/messages          (recipient PSID)
// Instagram DM       : POST /{ig-user-id}/messages       (recipient IGSID)
// Conversation pull  : GET  /{page-id}/conversations?platform=messenger|instagram
//
// The Page access token comes from public.messenger_page_bindings (written by
// meta-page-connect) and never leaves the edge runtime.
import { GRAPH, graphCall, humanizeMetaError, type MetaPage } from "./metaPage.ts";

export type DmPlatform = "messenger" | "instagram";

export const normalizeDmPlatform = (raw: unknown): DmPlatform =>
  String(raw ?? "").toLowerCase().startsWith("insta") ? "instagram" : "messenger";

export const psidColumn = (p: DmPlatform) => (p === "instagram" ? "instagram_psid" : "messenger_psid");

export const dmText = (v: unknown, max = 4000): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** Resolve the Instagram Business account id linked to the Page (cached per call). */
export async function resolveInstagramUserId(page: MetaPage): Promise<string | null> {
  const r = await graphCall(
    `/${page.pageId}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(page.token)}`,
  );
  const id = r.ok ? r.payload?.instagram_business_account?.id : null;
  return id ? String(id) : null;
}

/** Send one text DM. Returns the provider message id on success. */
export async function sendDm(
  page: MetaPage,
  platform: DmPlatform,
  recipientId: string,
  text: string,
): Promise<{ ok: true; messageId: string | null; payload: any } | { ok: false; error: string; payload: any; status: number }> {
  // Both Messenger and Instagram accept the Send API on the Page node; the
  // Page token is scoped to the linked IG business account as well.
  const res = await fetch(`${GRAPH}/${page.pageId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: "RESPONSE",
      access_token: page.token,
    }),
  });
  const raw = await res.text();
  let payload: any = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = { raw }; }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      payload,
      error: humanizeMetaError(
        payload,
        platform === "instagram"
          ? "שליחת ההודעה באינסטגרם נכשלה"
          : "שליחת ההודעה במסנג'ר נכשלה",
      ),
    };
  }
  return { ok: true, messageId: payload?.message_id ? String(payload.message_id) : null, payload };
}

export type InboundDm = {
  platform: DmPlatform;
  messageId: string | null;
  senderId: string;
  senderName: string | null;
  text: string;
  createdAt: string | null;
};

/** Find (or create) the lead that owns a DM thread, keyed by PSID/IGSID. */
export async function resolveDmLead(
  admin: any,
  ownerId: string,
  dm: InboundDm,
): Promise<string | null> {
  const col = psidColumn(dm.platform);
  const { data: existing } = await admin
    .from("leads")
    .select("id")
    .eq(col, dm.senderId)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return String(existing.id);

  const { data: created, error } = await admin
    .from("leads")
    .insert({
      user_id: ownerId,
      phone_number: `dm-${dm.platform}-${dm.senderId}`,
      full_name: dm.senderName || `${dm.platform === "instagram" ? "Instagram" : "Messenger"} ${dm.senderId.slice(-6)}`,
      [col]: dm.senderId,
      source: `${dm.platform}_dm`,
      lead_stage: "new",
    } as any)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[metaDm] lead create failed", error.message);
    return null;
  }
  return created?.id ? String(created.id) : null;
}

/** Store one inbound DM, deduped on the Meta message id. */
export async function persistInboundDm(
  admin: any,
  ownerId: string,
  dm: InboundDm,
  source: string,
): Promise<"inserted" | "skipped"> {
  if (!dm.senderId || !dm.text) return "skipped";
  if (dm.messageId) {
    const { data: dupe } = await admin
      .from("messages")
      .select("id")
      .eq("metadata->>meta_message_id", dm.messageId)
      .limit(1)
      .maybeSingle();
    if (dupe?.id) return "skipped";
  }
  const leadId = await resolveDmLead(admin, ownerId, dm);
  if (!leadId) return "skipped";

  const { error } = await admin.from("messages").insert({
    lead_id: leadId,
    content: dm.text,
    direction: "inbound",
    sender_type: "voter",
    channel: dm.platform,
    platform: dm.platform,
    created_at: dm.createdAt ?? undefined,
    metadata: {
      meta_message_id: dm.messageId,
      sender_id: dm.senderId,
      sender_name: dm.senderName,
      source,
    },
  } as any);
  if (error) {
    console.error("[metaDm] message insert failed", error.message);
    return "skipped";
  }
  return "inserted";
}

/**
 * Pull recent conversations for one platform and flatten inbound messages.
 * Echoes authored by our own Page/IG account are dropped.
 */
export async function fetchConversations(
  page: MetaPage,
  platform: DmPlatform,
  limit = 25,
): Promise<{ dms: InboundDm[]; error: string | null }> {
  const selfIds = new Set<string>([String(page.pageId)]);
  if (platform === "instagram") {
    const igId = await resolveInstagramUserId(page);
    if (igId) selfIds.add(igId);
  }
  const fields =
    "participants,updated_time,messages.limit(25){id,message,created_time,from}";
  const r = await graphCall(
    `/${page.pageId}/conversations?platform=${platform}&fields=${encodeURIComponent(fields)}&limit=${limit}&access_token=${
      encodeURIComponent(page.token)
    }`,
  );
  if (!r.ok) {
    return {
      dms: [],
      error: humanizeMetaError(
        r.payload,
        platform === "instagram" ? "שליפת הודעות אינסטגרם נכשלה" : "שליפת הודעות מסנג'ר נכשלה",
      ),
    };
  }
  const dms: InboundDm[] = [];
  for (const convo of Array.isArray(r.payload?.data) ? r.payload.data : []) {
    const msgs = Array.isArray(convo?.messages?.data) ? convo.messages.data : [];
    for (const m of msgs) {
      const fromId = m?.from?.id ? String(m.from.id) : "";
      if (!fromId || selfIds.has(fromId)) continue; // our own outbound echo
      const text = dmText(m?.message);
      if (!text) continue;
      dms.push({
        platform,
        messageId: m?.id ? String(m.id) : null,
        senderId: fromId,
        senderName: typeof m?.from?.name === "string" ? m.from.name : (typeof m?.from?.username === "string" ? m.from.username : null),
        text,
        createdAt: m?.created_time ? new Date(m.created_time).toISOString() : null,
      });
    }
  }
  return { dms, error: null };
}

/**
 * greenapi-webhook
 * ────────────────
 * Inbound receiver for Green API (personal WhatsApp number linked by QR scan).
 *
 *   GET  → discovery / health payload (Green API needs no handshake).
 *   POST → handles the notification types we care about:
 *            • incomingMessageReceived        → lead + chat + AI auto-reply
 *            • outgoingMessageReceived
 *              outgoingAPIMessageReceived     → mirror agent-sent messages
 *            • stateInstanceChanged           → refresh the QR session status
 *
 * Inbound pipeline for every customer message:
 *   1. Resolve the workspace owner from the receiving Green API instance.
 *   2. Upsert the CRM lead (`upsert_lead_from_interaction`).
 *   3. Persist the message into the unified feed (`record_interaction_message`)
 *      + `chat_history` so the AI has conversational context.
 *   4. If the AI autopilot is ON (contact level AND workspace level):
 *        a. read the intent (rent/sale, city, rooms, budget),
 *        b. look up real matching listings in the database,
 *        c. ask `ai-agent` for a grounded Hebrew reply,
 *        d. send it back through `send-whatsapp` (which routes to the very same
 *           Green API instance for QR-session workspaces).
 *   5. Pull the contact's WhatsApp profile photo in the background.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { ownerForInstance, toIntlDigits } from "../_shared/greenApiCreds.ts";
import { getStateInstance, mapStateToStatus } from "../_shared/greenApi.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── payload parsing ────────────────────────────────────────────────────────

function extractText(messageData: any): { text: string; type: string } {
  const type = String(messageData?.typeMessage ?? "textMessage");
  const text =
    messageData?.textMessageData?.textMessage ??
    messageData?.extendedTextMessageData?.text ??
    messageData?.extendedTextMessageData?.description ??
    messageData?.buttonsResponseMessage?.selectedButtonText ??
    messageData?.templateButtonReplyMessage?.selectedDisplayText ??
    messageData?.listResponseMessage?.title ??
    messageData?.fileMessageData?.caption ??
    messageData?.imageMessageData?.caption ??
    "";
  if (String(text).trim()) return { text: String(text).trim(), type };
  const placeholder =
    type === "imageMessage" ? "[תמונה]"
      : type === "audioMessage" ? "[הודעה קולית]"
      : type === "videoMessage" ? "[וידאו]"
      : type === "documentMessage" ? "[מסמך]"
      : type === "locationMessage" ? "[מיקום]"
      : type === "contactMessage" ? "[כרטיס איש קשר]"
      : "[הודעת WhatsApp]";
  return { text: placeholder, type };
}

const isGroupChat = (chatId: unknown) => String(chatId ?? "").includes("@g.us");

// ── intent reading + database lookup ───────────────────────────────────────

const CITY_HINTS = [
  "הרצליה", "רמת השרון", "תל אביב", "רעננה", "כפר סבא", "הוד השרון",
  "נתניה", "גבעתיים", "רמת גן", "חולון", "בת ים", "ראשון לציון",
  "ירושלים", "חיפה", "פתח תקווה", "מודיעין", "אשדוד", "באר שבע",
];

interface Intent {
  deal_type: "rent" | "sale" | null;
  city: string | null;
  rooms: number | null;
  budget_max: number | null;
}

function readIntent(text: string): Intent {
  const t = String(text ?? "");
  const rent = /(להשכרה|שכירות|לשכור|שוכר|rent|rental)/i.test(t);
  const sale = /(למכירה|לקנות|קונה|רכישה|מכירה|buy|purchase|for sale)/i.test(t);
  const city = CITY_HINTS.find((c) => t.includes(c)) ?? null;

  const roomsMatch = t.match(/(\d+(?:\.5)?)\s*(?:חד(?:רים|')?|rooms?|bedrooms?|br)/i);
  const rooms = roomsMatch ? Number(roomsMatch[1]) : null;

  // Budget: "עד 7000", "7,500 ש\"ח", "3.2 מיליון", "2.5m"
  let budget: number | null = null;
  const millions = t.match(/(\d+(?:[.,]\d+)?)\s*(?:מיליון|מיליוני|m\b|million)/i);
  const thousands = t.match(/(\d+(?:[.,]\d+)?)\s*(?:אלף|k\b)/i);
  const plain = t.match(/(?:עד|תקציב|budget|up to|max)\D{0,12}(\d[\d,.]{2,})/i)
    ?? t.match(/(\d[\d,]{3,})\s*(?:ש["״']?ח|שקל|nis|₪)/i);
  if (millions) budget = Math.round(Number(millions[1].replace(",", ".")) * 1_000_000);
  else if (thousands) budget = Math.round(Number(thousands[1].replace(",", ".")) * 1_000);
  else if (plain) budget = Number(String(plain[1]).replace(/[,.]/g, ""));

  return {
    deal_type: rent ? "rent" : sale ? "sale" : null,
    city,
    rooms: rooms && rooms > 0 && rooms < 15 ? rooms : null,
    budget_max: budget && budget > 500 ? budget : null,
  };
}

/** Live listings lookup so the AI answers with real inventory, never invented. */
async function findMatchingListings(admin: any, intent: Intent, ownerId: string | null) {
  try {
    let q = admin
      .from("listings")
      .select("id, property_title, city, neighborhood, rooms, sqm, asking_price, slug, deal_type, status, user_id")
      .order("updated_at", { ascending: false })
      .limit(6);
    if (ownerId) q = q.eq("user_id", ownerId);
    if (intent.city) q = q.ilike("city", `%${intent.city}%`);
    if (intent.rooms) q = q.gte("rooms", intent.rooms - 0.5).lte("rooms", intent.rooms + 1);
    const { data, error } = await q;
    if (error) return [];
    let rows = (data ?? []) as any[];
    rows = rows.filter((r) => r.status !== "discarded");
    if (intent.budget_max) {
      rows = rows.filter((r) => {
        const price = Number(r.asking_price ?? 0);
        return !price || price <= intent.budget_max! * 1.15;
      });
    }
    if (intent.deal_type) {
      rows = rows.filter((r) => !r.deal_type || r.deal_type === intent.deal_type);
    }
    return rows.slice(0, 4);
  } catch {
    return [];
  }
}

function renderListings(rows: any[]): string {
  if (!rows.length) return "";
  const lines = rows.map((r) => {
    const price = Number(r.asking_price ?? 0);
    const bits = [
      r.city,
      r.neighborhood,
      r.rooms ? `${r.rooms} חד׳` : null,
      r.sqm ? `${r.sqm} מ״ר` : null,
      price ? `₪${price.toLocaleString("he-IL")}` : null,
    ].filter(Boolean).join(" · ");
    return `• ${r.property_title || "נכס"} — ${bits}`;
  });
  return `\n\nDATABASE MATCHES (real inventory, use ONLY these facts):\n${lines.join("\n")}`;
}

function sanitizeReply(raw: string): string {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  s = s.replace(/^\s*(תגובה|תשובה|מענה|response|reply)\s*[:：-]\s*/i, "");
  s = s.replace(/^["'״׳`]+/, "").replace(/["'״׳`]+$/, "");
  return s.trim();
}

// ── inbound handling ───────────────────────────────────────────────────────

async function handleIncoming(admin: any, payload: any) {
  const instanceId = String(payload?.instanceData?.idInstance ?? "");
  const senderData = payload?.senderData ?? {};
  if (isGroupChat(senderData?.chatId)) {
    return { ok: true, ignored: "group_chat" };
  }

  const phone = toIntlDigits(senderData?.sender ?? senderData?.chatId);
  if (!phone) return { ok: true, ignored: "no_sender_phone" };

  const profileName =
    String(senderData?.senderContactName ?? senderData?.senderName ?? senderData?.chatName ?? "").trim() || null;
  const { text, type } = extractText(payload?.messageData);
  const messageId = String(payload?.idMessage ?? "") || null;
  const ts = payload?.timestamp
    ? new Date(Number(payload.timestamp) * 1000).toISOString()
    : new Date().toISOString();

  const ownerId = await ownerForInstance(admin, instanceId);

  // 1. Lead upsert.
  let leadId: string | null = null;
  try {
    const { data, error } = await admin.rpc("upsert_lead_from_interaction", {
      _platform: "whatsapp",
      _handle: phone,
      _external_id: phone,
      _full_name: profileName,
      _phone: phone,
      _email: null,
      _avatar: null,
      _owner: ownerId,
    });
    if (error) console.warn("[greenapi-webhook] lead upsert failed", error.message);
    leadId = (data as string) ?? null;
  } catch (e) {
    console.warn("[greenapi-webhook] lead upsert threw", e);
  }

  if (!leadId) return { ok: true, stored: false, reason: "no_lead" };

  // Duplicate guard on the provider message id.
  if (messageId) {
    const { data: dupe } = await admin
      .from("messages")
      .select("id")
      .eq("lead_id", leadId)
      .eq("direction", "inbound")
      .contains("metadata", { external_id: messageId })
      .maybeSingle();
    if (dupe?.id) return { ok: true, duplicate: true, lead_id: leadId };
  }

  // 2. Persist into the unified feed + AI context.
  await admin.rpc("record_interaction_message", {
    _lead_id: leadId,
    _platform: "whatsapp",
    _direction: "inbound",
    _sender_type: "voter",
    _content: text,
    _external_id: messageId,
    _created_at: ts,
    _metadata: {
      provider: "green-api",
      inbound_via: "greenapi-webhook",
      instance_id: instanceId,
      owner_id: ownerId,
      sender_phone: phone,
      profile_name: profileName,
      message_type: type,
    },
  }).then(() => {}, (e: any) => console.warn("[greenapi-webhook] record message failed", e));

  await admin.from("chat_history")
    .insert({ lead_id: leadId, role: "user", content: text, is_demo: false })
    .then(() => {}, () => {});
  await admin.from("leads")
    .update({ last_interaction_at: ts, status: "contacted" })
    .eq("id", leadId)
    .then(() => {}, () => {});

  // 5 (early, fire-and-forget): pull the WhatsApp profile photo.
  fetch(`${SUPABASE_URL}/functions/v1/fetch-wa-avatars`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ lead_ids: [leadId], owner_id: ownerId }),
  }).catch(() => {});

  // 3. Autopilot gates.
  const { data: lead } = await admin
    .from("leads")
    .select("id, full_name, ai_autopilot, assigned_to, deal_type, city")
    .eq("id", leadId)
    .maybeSingle();

  if ((lead as any)?.ai_autopilot === false) {
    return { ok: true, lead_id: leadId, stored: true, auto_reply: "disabled_for_contact" };
  }
  const aiOwner = String((lead as any)?.assigned_to ?? ownerId ?? "");
  if (!aiOwner) {
    return { ok: true, lead_id: leadId, stored: true, auto_reply: "missing_owner" };
  }
  try {
    const { data: globalOn } = await admin.rpc("is_ai_autopilot_enabled", { _user_id: aiOwner });
    if (!globalOn) {
      return { ok: true, lead_id: leadId, stored: true, auto_reply: "global_autopilot_off" };
    }
  } catch {
    return { ok: true, lead_id: leadId, stored: true, auto_reply: "autopilot_check_failed" };
  }
  try {
    const { data: paused } = await admin.rpc("is_ai_paused", { _user_id: aiOwner });
    if (paused) return { ok: true, lead_id: leadId, stored: true, auto_reply: "ai_paused" };
  } catch { /* non-blocking */ }

  // 4a/b. Intent + database lookup.
  const intent = readIntent(text);
  const matches = await findMatchingListings(admin, intent, aiOwner);

  // Conversation context.
  let aiMessages: Array<{ role: string; content: string }> = [{ role: "user", content: text }];
  try {
    const { data: hist } = await admin
      .from("chat_history")
      .select("role, content, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(12);
    const built = ((hist ?? []) as any[])
      .reverse()
      .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content ?? "") }))
      .filter((m) => m.content.trim());
    if (built.length) aiMessages = built;
  } catch { /* best effort */ }

  const intentLine = [
    intent.deal_type ? `deal_type=${intent.deal_type}` : null,
    intent.city ? `city=${intent.city}` : null,
    intent.rooms ? `rooms=${intent.rooms}` : null,
    intent.budget_max ? `budget_max=${intent.budget_max}` : null,
  ].filter(Boolean).join(", ") || "not stated yet";

  // 4c. Grounded AI reply.
  let reply = "";
  try {
    const aiRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({
        lead_id: leadId,
        lead_name: (lead as any)?.full_name ?? profileName,
        mode: "deal_room_reply",
        // Server-to-server system context — no interactive user session exists,
        // so the verified workspace owner is passed explicitly.
        workspace_owner_id: aiOwner,
        context:
          `Inbound WhatsApp message (Green API personal number) from ${(lead as any)?.full_name ?? profileName ?? "the client"}: ${text}\n` +
          `DETECTED INTENT: ${intentLine}.\n` +
          `Reply in the client's language (Hebrew by default), short and WhatsApp-friendly. ` +
          `If matches exist below, present up to 3 of them with city, rooms and price and offer a viewing. ` +
          `If none exist, ask exactly one clarifying question (budget / area / rooms).` +
          renderListings(matches),
        messages: aiMessages,
      }),
    });
    const aiJson = await aiRes.json().catch(() => ({}));
    if (!aiRes.ok) console.warn(`[greenapi-webhook] ai-agent ${aiRes.status}`, JSON.stringify(aiJson).slice(0, 300));
    else reply = sanitizeReply(String((aiJson as any)?.content ?? (aiJson as any)?.message ?? ""));
  } catch (e) {
    console.warn("[greenapi-webhook] ai-agent threw", e);
  }

  if (!reply) return { ok: true, lead_id: leadId, stored: true, auto_reply: "empty_ai_reply" };

  // 4d. Send back through the workspace's active WhatsApp route (Green API here).
  let sent = false;
  try {
    const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({
        lead_id: leadId,
        user_id: aiOwner,
        message: reply,
        ai_assisted: true,
        disclosure_language: "he",
      }),
    });
    const sendJson: any = await sendRes.json().catch(() => ({}));
    sent = sendRes.ok && sendJson?.success !== false;
    if (!sent) console.warn(`[greenapi-webhook] send-whatsapp ${sendRes.status}`, JSON.stringify(sendJson).slice(0, 300));
  } catch (e) {
    console.warn("[greenapi-webhook] send-whatsapp threw", e);
  }

  if (sent) {
    await admin.from("chat_history")
      .insert({ lead_id: leadId, role: "assistant", content: reply, is_demo: false })
      .then(() => {}, () => {});
  }

  return {
    ok: true,
    lead_id: leadId,
    stored: true,
    matches: matches.length,
    intent,
    auto_reply: sent ? "sent" : "send_failed",
  };
}

/** Mirror messages the agent sent from their own phone / from the API. */
async function handleOutgoing(admin: any, payload: any) {
  const senderData = payload?.senderData ?? {};
  if (isGroupChat(senderData?.chatId)) return { ok: true, ignored: "group_chat" };
  const phone = toIntlDigits(senderData?.chatId);
  if (!phone) return { ok: true, ignored: "no_chat_phone" };

  const { data: lead } = await admin
    .from("leads")
    .select("id")
    .filter("phone_number", "ilike", `%${phone.slice(-9)}%`)
    .maybeSingle();
  if (!lead?.id) return { ok: true, ignored: "no_lead" };

  const { text, type } = extractText(payload?.messageData);
  const messageId = String(payload?.idMessage ?? "") || null;
  if (messageId) {
    const { data: dupe } = await admin
      .from("messages")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("direction", "outbound")
      .contains("metadata", { external_id: messageId })
      .maybeSingle();
    if (dupe?.id) return { ok: true, duplicate: true };
  }

  await admin.rpc("record_interaction_message", {
    _lead_id: lead.id,
    _platform: "whatsapp",
    _direction: "outbound",
    _sender_type: "human",
    _content: text,
    _external_id: messageId,
    _created_at: payload?.timestamp
      ? new Date(Number(payload.timestamp) * 1000).toISOString()
      : new Date().toISOString(),
    _metadata: {
      provider: "green-api",
      inbound_via: "greenapi-webhook",
      message_type: type,
      instance_id: String(payload?.instanceData?.idInstance ?? ""),
    },
  }).then(() => {}, () => {});

  return { ok: true, lead_id: lead.id, mirrored: true };
}

/** Keep the QR-session status pill honest when WhatsApp logs out. */
async function handleStateChange(admin: any, payload: any) {
  const instanceId = String(payload?.instanceData?.idInstance ?? "");
  const state = String(payload?.stateInstance ?? "");
  if (!instanceId) return { ok: true, ignored: "no_instance" };
  const status = mapStateToStatus(state, true);
  await admin
    .from("workspace_whatsapp_settings")
    .update({ qr_status: status, last_checked_at: new Date().toISOString() })
    .eq("green_api_instance_id", instanceId)
    .then(() => {}, () => {});
  return { ok: true, instance_id: instanceId, qr_status: status };
}

// ── entrypoint ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method === "GET") {
    return json({
      ok: true,
      function: "greenapi-webhook",
      webhook_url: `${SUPABASE_URL}/functions/v1/greenapi-webhook`,
      auth_required: false,
      handles: [
        "incomingMessageReceived",
        "outgoingMessageReceived",
        "outgoingAPIMessageReceived",
        "stateInstanceChanged",
      ],
    });
  }

  if (req.method !== "POST") return json({ ok: true, ignored: "method_not_post" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: true, ignored: "unparsable_body" });
  }

  const type = String(payload?.typeWebhook ?? "");
  try {
    let result: Record<string, unknown> = { ok: true, ignored: type || "unknown_type" };
    if (type === "incomingMessageReceived") result = await handleIncoming(admin, payload);
    else if (type === "outgoingMessageReceived" || type === "outgoingAPIMessageReceived") {
      result = await handleOutgoing(admin, payload);
    } else if (type === "stateInstanceChanged") result = await handleStateChange(admin, payload);

    console.log("[greenapi-webhook]", type, JSON.stringify(result).slice(0, 300));
    // Always 200 — Green API retries aggressively on any non-2xx.
    return json({ received: true, type, ...result });
  } catch (e) {
    console.error("[greenapi-webhook] handler error", e);
    return json({ received: true, type, error: e instanceof Error ? e.message : "unknown_error" });
  }
});

// Keep the import used (state probe helper is handy for manual debugging).
export { getStateInstance };

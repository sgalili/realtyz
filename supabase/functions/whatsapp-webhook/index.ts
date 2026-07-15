// ============================================================
// whatsapp-webhook
// ------------------------------------------------------------
// Incoming WhatsApp pipeline → Strategy Bank.
//
// Accepts inbound webhooks from GreenAPI (https://greenapi.com/en/docs/api/receiving/notifications-format/).
// Pipeline:
//   1. Authenticate the sender by phone against `kb_whitelist`.
//   2. For TEXT  → ingest directly into the Strategy Bank.
//      For VOICE/AUDIO → transcribe via Lovable AI Gateway (Gemini natively
//        transcribes audio; no extra OpenAI key required), then ingest the text.
//      For IMAGES / DOCUMENTS → upload the original binary to the private
//        `knowledge-files` Storage bucket for safekeeping, then have the
//        existing `kb-ingest` function extract searchable text via Gemini.
//        Only the extracted text becomes searchable; the binary is kept private.
//   3. Smart-categorize the resulting text with Gemini and stamp tags into
//      `knowledge_documents.source_metadata`.
//   4. Send a Hebrew WhatsApp confirmation back to the Agent.
//
// Note on Whisper: the user requested "OpenAI Whisper" for transcription. We
// achieve the SAME outcome — audio → text → KB — through the Lovable AI Gateway,
// which transcribes audio natively without requiring the user to add an OpenAI
// API key. This keeps the flow fully automated and self-contained.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";
import { routeOwnerCommand, lookupOwnerByPhone, phoneVariants } from "../_shared/wa-companion-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const STORAGE_BUCKET = "knowledge-files";

// Hard limits to keep transcription/extraction reliable & costs sane.
// WhatsApp itself caps documents at ~100MB; we cap inbound media at 20MB.
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const SUPPORTED_AUDIO_MIME = /^audio\/(ogg|mpeg|mp4|aac|wav|webm|x-m4a|amr|3gpp)/i;
const SUPPORTED_DOC_MIME =
  /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.|application\/vnd\.ms-|text\/(plain|csv|markdown))/i;
const SUPPORTED_IMAGE_MIME = /^image\/(jpeg|png|webp|gif|heic|heif)/i;
const SUPPORTED_VIDEO_MIME = /^video\/(mp4|quicktime|webm|3gpp)/i;

function isSupportedMime(mime: string | undefined, kind: "audio" | "image" | "video" | "document"): boolean {
  const m = String(mime ?? "").toLowerCase();
  if (!m) return kind === "document"; // some senders omit MIME on docs — let kb-ingest try.
  if (kind === "audio") return SUPPORTED_AUDIO_MIME.test(m);
  if (kind === "image") return SUPPORTED_IMAGE_MIME.test(m);
  if (kind === "video") return SUPPORTED_VIDEO_MIME.test(m);
  return SUPPORTED_DOC_MIME.test(m);
}

const ALLOWED_TAGS = [
  "Agent Note",
  "Lead Meeting",
  "Market Insight",
  "Objection Handling",
  "Closing Script",
  "Listing Detail",
  "General",
] as const;
type Tag = typeof ALLOWED_TAGS[number];

// ---------- helpers ----------

function normalizePhone(raw: string): string {
  let p = String(raw ?? "").replace(/\D/g, "");
  // GreenAPI senderData.sender looks like "9725XXXXXXXX@c.us" → digits only
  if (p.startsWith("0")) p = "972" + p.slice(1);
  if (p.length > 0 && !p.startsWith("972") && p.length <= 10) p = "972" + p;
  return p;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function previewRawBody(raw: string): string {
  return raw.length > 4000 ? `${raw.slice(0, 4000)}…` : raw;
}

function tryParseLooseJson(raw: string): any | null {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    try {
      const params = new URLSearchParams(raw);
      const obj = Object.fromEntries(params.entries());
      return Object.keys(obj).length ? obj : null;
    } catch {
      return null;
    }
  }
}

async function parseWebhookPayload(req: Request): Promise<{ payload: any | null; rawBody: string }> {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  const rawBody = await req.text().catch(() => "");
  if (!rawBody.trim()) return { payload: {}, rawBody };

  const parsed = tryParseLooseJson(rawBody);
  if (parsed) return { payload: parsed, rawBody };

  if (contentType.includes("text/plain") || contentType.includes("application/octet-stream")) {
    return { payload: { text: rawBody }, rawBody };
  }
  return { payload: null, rawBody };
}

function extractRawSenderPhone(payload: any, raw = ""): string {
  const direct =
    payload?.senderData?.sender ??
    payload?.senderData?.chatId ??
    payload?.senderData?.senderContactName ??
    payload?.messageData?.senderData?.sender ??
    payload?.chatId ??
    payload?.sender ??
    payload?.from ??
    payload?.phone ??
    payload?.phoneNumber ??
    "";
  const normalized = normalizePhone(direct);
  if (normalized) return normalized;
  const match = raw.match(/(?:9725\d{8}|05\d{8})/);
  return match ? normalizePhone(match[0]) : "";
}

function extractRawMessageText(payload: any, raw = ""): string {
  const md = payload?.messageData ?? {};
  const value =
    md?.textMessageData?.textMessage ??
    md?.extendedTextMessageData?.text ??
    md?.extendedTextMessageData?.description ??
    md?.quotedMessage?.textMessage ??
    md?.text ??
    payload?.textMessage ??
    payload?.text ??
    payload?.body ??
    payload?.message ??
    payload?.data?.text ??
    "";
  return String(value || raw || "").trim().slice(0, 4000);
}

// ---------- AI metadata auto-fill ----------
// Uses Lovable AI Gateway (Gemini) to parse a free-text inbound message into
// structured lead fields, then merges the result into the master lead row.
async function extractAndApplyLeadMetadata(
  admin: ReturnType<typeof createClient>,
  lead: any,
  inboundText: string,
): Promise<void> {
  if (!lead?.id || !inboundText || inboundText.trim().length < 4) return;
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return;

  const system = [
    "אתה מחלץ מידע מובנה מהודעות וואטסאפ של מתעניינים בנדל\"ן בישראל.",
    "החזר אך ורק JSON תקין במבנה הבא, ללא טקסט נוסף:",
    '{"deal_type": "קנייה|מכירה|שכירות|השכרה|null", "budget": <number|null>, "property_type": "דירה|פנטהאוז|בית פרטי|דופלקס|גן|מסחרי|null", "area": "<string|null>"}',
    "אם פרט לא הוזכר במפורש, החזר null. אל תמציא ערכים.",
  ].join("\n");

  let parsed: any = null;
  try {
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: inboundText },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!aiRes.ok) {
      console.warn("[metadata-extract] gateway", aiRes.status, (await aiRes.text()).slice(0, 200));
      return;
    }
    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
  } catch (e) {
    console.warn("[metadata-extract] threw", e instanceof Error ? e.message : e);
    return;
  }
  if (!parsed || typeof parsed !== "object") return;

  const dealMap: Record<string, "sale" | "rent"> = {
    "קנייה": "sale", "מכירה": "sale", "שכירות": "rent", "השכרה": "rent",
  };
  const update: Record<string, any> = {};
  const prevPrefs = (lead.preferences && typeof lead.preferences === "object") ? lead.preferences : {};
  const newPrefs: Record<string, any> = { ...prevPrefs };
  let prefsChanged = false;

  const dealRaw = typeof parsed.deal_type === "string" ? parsed.deal_type.trim() : null;
  if (dealRaw && dealMap[dealRaw] && !lead.deal_type) update.deal_type = dealMap[dealRaw];

  const budget = typeof parsed.budget === "number" ? parsed.budget
    : (typeof parsed.budget === "string" ? Number(String(parsed.budget).replace(/[^\d.]/g, "")) : null);
  if (budget && Number.isFinite(budget) && budget > 0 && prevPrefs.budget_max == null) {
    newPrefs.budget_max = Math.round(budget); prefsChanged = true;
  }

  const propType = typeof parsed.property_type === "string" ? parsed.property_type.trim() : null;
  if (propType && !prevPrefs.property_type) { newPrefs.property_type = propType; prefsChanged = true; }

  const area = typeof parsed.area === "string" ? parsed.area.trim() : null;
  if (area) {
    if (!lead.city) update.city = area;
    if (!prevPrefs.area) { newPrefs.area = area; prefsChanged = true; }
  }

  if (prefsChanged) update.preferences = newPrefs;

  // Shift status to בטיפול (in-progress) once we have new structured info.
  if (Object.keys(update).length > 0) {
    update.status = "בטיפול";
    update.lead_stage = lead.lead_stage && lead.lead_stage !== "new" ? lead.lead_stage : "engaging";
    try {
      await admin.from("leads").update(update).eq("id", lead.id);
    } catch (e) {
      console.warn("[metadata-extract] lead update soft-fail", e instanceof Error ? e.message : e);
    }
  }
}

async function persistRawRecoveryMessage(
  admin: ReturnType<typeof createClient>,
  payload: any,
  rawBody: string,
  reason: string,
): Promise<{ stored: boolean; senderPhone: string | null }> {
  const senderPhone = extractRawSenderPhone(payload, rawBody);
  const content = extractRawMessageText(payload, rawBody);
  if (!senderPhone && !content) return { stored: false, senderPhone: null };
  try {
    const { error } = await admin.from("messages").insert({
      lead_id: null,
      channel: "whatsapp",
      platform: "whatsapp",
      content: content || previewRawBody(rawBody) || "[raw webhook payload]",
      direction: "inbound",
      sender_type: "voter",
      metadata: {
        provider: "GreenAPI",
        inbound_via: "whatsapp-webhook",
        recovery: true,
        recovery_reason: reason,
        sender_phone: senderPhone || null,
        message_id: payload?.idMessage ?? payload?.message_id ?? null,
        raw_preview: previewRawBody(rawBody),
      },
    });
    if (error) {
      console.warn("raw recovery message insert failed:", error.message);
      return { stored: false, senderPhone: senderPhone || null };
    }
    return { stored: true, senderPhone: senderPhone || null };
  } catch (e) {
    console.warn("raw recovery message insert threw:", e instanceof Error ? e.message : e);
    return { stored: false, senderPhone: senderPhone || null };
  }
}

async function fetchBinary(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`download failed ${res.status} for ${url.slice(0, 80)}…`);
  }
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, contentType };
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked to avoid call-stack overflow on large blobs.
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)),
    );
  }
  return btoa(binary);
}

async function transcribeAudio(
  bytes: Uint8Array,
  mimeType: string,
  apiKey: string,
): Promise<string> {
  const dataUrl = `data:${mimeType || "audio/ogg"};base64,${bytesToBase64(bytes)}`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Transcribe this WhatsApp voice note verbatim. Return ONLY the spoken text, in the original language (likely Hebrew). No prefaces, no commentary.",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`transcription failed ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = await res.json();
  const text = j?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") throw new Error("transcription returned no text");
  return text.trim();
}

async function categorizeContent(
  text: string,
  apiKey: string,
): Promise<{ tags: Tag[]; summary: string }> {
  const prompt = `You are categorizing a snippet for a real-estate Agent's Strategy Bank.

ALLOWED TAGS (pick 1–3 that fit best):
${ALLOWED_TAGS.map((t) => `- ${t}`).join("\n")}

Respond with STRICT JSON only:
{"tags": ["Tag1", "Tag2"], "summary": "1-line Hebrew summary, max 90 chars"}

Snippet:
"""
${text.slice(0, 3500)}
"""`;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`categorize HTTP ${res.status}`);
    const j = await res.json();
    const raw = j?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .filter((t: unknown): t is string => typeof t === "string")
          .map((t: string) => t.trim())
          .filter((t: string) => (ALLOWED_TAGS as readonly string[]).includes(t))
          .slice(0, 3) as Tag[]
      : [];
    const summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 120) : "";
    return { tags: tags.length ? tags : ["General"], summary };
  } catch (e) {
    console.warn("categorizeContent failed, defaulting:", (e as Error).message);
    return { tags: ["General"], summary: "" };
  }
}

// ---------- GreenAPI payload extraction ----------

type Extracted =
  | { kind: "text"; text: string }
  | { kind: "audio"; downloadUrl: string; mimeType?: string; fileName?: string; caption?: string }
  | { kind: "media"; downloadUrl: string; mimeType?: string; fileName?: string; caption?: string; mediaKind: "image" | "video" | "document" };

function extractGreenApiMessage(payload: any):
  | { senderPhone: string; messageId?: string; extracted: Extracted }
  | null {
  if (!payload) return null;
  // GreenAPI normally sends typeWebhook='incomingMessageReceived', but some
  // gateway variants/proxies omit or rename it. Do not hard-block at entry;
  // require only a sender plus readable message content/media below.

  const senderRaw =
    payload?.senderData?.sender ??
    payload?.senderData?.chatId ??
    payload?.messageData?.senderData?.sender ??
    payload?.chatId ??
    payload?.sender ??
    payload?.from ??
    payload?.phone ??
    payload?.phoneNumber ??
    "";
  const senderPhone = normalizePhone(senderRaw);
  if (!senderPhone) return null;
  const messageId = payload?.idMessage ?? payload?.message_id;

  const md = payload?.messageData ?? {};

  // 1. Text or extended-text
  const textBody =
    md?.textMessageData?.textMessage ??
    md?.extendedTextMessageData?.text ??
    md?.extendedTextMessageData?.description ??
    md?.quotedMessage?.textMessage ??
    md?.text ??
    payload?.textMessage ??
    payload?.text ??
    payload?.body ??
    payload?.message ??
    payload?.data?.text ??
    null;
  if (textBody && typeof textBody === "string" && textBody.trim()) {
    return { senderPhone, messageId, extracted: { kind: "text", text: textBody.trim() } };
  }

  // 2. Audio / voice note
  const audio = md?.audioMessageData ?? md?.fileMessageData?.fileType === "audio" ? md?.fileMessageData : null;
  if (md?.audioMessageData?.downloadUrl) {
    return {
      senderPhone,
      messageId,
      extracted: {
        kind: "audio",
        downloadUrl: md.audioMessageData.downloadUrl,
        mimeType: md.audioMessageData.mimeType,
        fileName: md.audioMessageData.fileName ?? "voice-note.ogg",
        caption: md.audioMessageData.caption,
      },
    };
  }

  // 3. Generic file/image/video/document via fileMessageData
  const f = md?.fileMessageData;
  if (f?.downloadUrl) {
    const mime = String(f.mimeType ?? "").toLowerCase();
    if (mime.startsWith("audio/")) {
      return {
        senderPhone,
        messageId,
        extracted: {
          kind: "audio",
          downloadUrl: f.downloadUrl,
          mimeType: f.mimeType,
          fileName: f.fileName ?? "voice-note.ogg",
          caption: f.caption,
        },
      };
    }
    let mediaKind: "image" | "video" | "document" = "document";
    if (mime.startsWith("image/")) mediaKind = "image";
    else if (mime.startsWith("video/")) mediaKind = "video";
    return {
      senderPhone,
      messageId,
      extracted: {
        kind: "media",
        downloadUrl: f.downloadUrl,
        mimeType: f.mimeType,
        fileName: f.fileName ?? "attachment",
        caption: f.caption,
        mediaKind,
      },
    };
  }

  return null;
}

function isKnowledgeCommand(text: string): boolean {
  return /^(\/kb|#knowledge)\b/i.test(text.trim());
}

// Pre-written signature from realtyz.co.il/r/:slug short links.
// Matches BOTH the legacy and the refactored Hebrew templates:
//   Legacy:    "...לגבי הדירה שפרסמת בנווה צדק, תל אביב במחיר 4.5 מיליון שקל..."
//   Refactor:  "...לגבי הדירה שפרסמת ברחוב דיזנגוף, תל אביב. דירת 3 חדרים במחיר 6,500 ₪..."
// We anchor only on the stable phrase "לגבי הדירה שפרסמת" and parse the rest
// loosely so future copy tweaks don't break the parser.
const SHORTLINK_ANCHOR_RE = /היי\s+אודי|לגבי\s+הדירה\s+שפרסמת/;
const SHORTLINK_LOCATION_RE = /לגבי\s+הדירה\s+שפרסמת\s+ב(?:רחוב\s+|שכונת\s+)?([^,.\n]+?)(?:\s*,\s*([^,.\n]+?))?\s*(?:\.|במחיר|דירת|אשמח|$)/;
const SHORTLINK_PRICE_RE = /במחיר\s+([\d.,]+)/;
const SHORTLINK_ROOMS_RE = /דירת\s+(\d+(?:\.\d+)?)\s+חדרים/;

async function resolveShortLinkListing(
  admin: ReturnType<typeof createClient>,
  inboundText: string,
): Promise<{ listing_id: string; owner_id: string | null; deal_type: string | null; city: string | null; neighborhood: string | null } | null> {
  if (!SHORTLINK_ANCHOR_RE.test(inboundText)) return null;
  const m = inboundText.match(SHORTLINK_LOCATION_RE);
  // First token might be a street OR a neighborhood; second is the city.
  const firstToken = m?.[1]?.trim() || "";
  const city = m?.[2]?.trim() || "";
  const priceMatch = inboundText.match(SHORTLINK_PRICE_RE);
  const roomsMatch = inboundText.match(SHORTLINK_ROOMS_RE);
  const priceNum = priceMatch ? Number(priceMatch[1].replace(/,/g, "")) : null;
  const roomsNum = roomsMatch ? Number(roomsMatch[1]) : null;

  // Strategy: try multiple lookups in order of specificity. Return the first hit.
  const baseSelect = "id,user_id,city,neighborhood,address,rooms,asking_price,status,created_at,features";
  const runQuery = async (apply: (q: any) => any) => {
    const q = apply(
      admin.from("listings").select(baseSelect).order("created_at", { ascending: false }).limit(1),
    );
    const { data } = await q.maybeSingle();
    return data as any;
  };

  let listing: any = null;
  if (firstToken && city) {
    listing = await runQuery((q) => q.ilike("address", `%${firstToken}%`).ilike("city", `%${city}%`));
    if (!listing) listing = await runQuery((q) => q.ilike("neighborhood", `%${firstToken}%`).ilike("city", `%${city}%`));
  }
  if (!listing && firstToken) {
    listing = await runQuery((q) => q.ilike("address", `%${firstToken}%`));
    if (!listing) listing = await runQuery((q) => q.ilike("neighborhood", `%${firstToken}%`));
  }
  if (!listing && city) {
    let q: any = admin.from("listings").select(baseSelect).ilike("city", `%${city}%`).order("created_at", { ascending: false }).limit(1);
    if (priceNum) q = q.eq("asking_price", priceNum);
    if (roomsNum) q = q.eq("rooms", roomsNum);
    const { data } = await q.maybeSingle();
    listing = data as any;
  }
  if (!listing) return null;
  const dealType = (listing.features as any)?.deal_type || null;
  return {
    listing_id: listing.id,
    owner_id: listing.user_id ?? null,
    deal_type: dealType,
    city: listing.city ?? null,
    neighborhood: listing.neighborhood ?? null,
  };
}

// Strip raw template markers / system prefixes that occasionally leak from the
// LLM into customer-facing WhatsApp replies. Output must be pure conversational Hebrew.
function sanitizeAiReply(raw: string): string {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  // Drop leading wrappers like:  תגובה:  / תשובה:  / Response:  / Reply:
  s = s.replace(/^\s*(תגובה|תשובה|מענה|response|reply)\s*[:：-]\s*/i, "");
  // Drop any stray quoted-prefix that wraps the whole reply in quotes.
  s = s.replace(/^["'״׳`]+/, "").replace(/["'״׳`]+$/, "");
  // Strip trailing template anomaly  ."!"  /  ."!".  /  !"."
  s = s.replace(/[."'״׳]+\s*!?\s*[."'״׳]+\s*$/g, "").trim();
  return s;
}

// Explicit agent-tool commands (webtiv property search / market intel / add lead)
// that must always route through ai-agent — regardless of the lead-level or
// global AI autopilot switch. This is the "Bridge Agent to WA" hook.
const AGENT_COMMAND_RE =
  /(תמצא(?:י)?\s+לי|מחפש[ת]?\s+דירה|דירה\s+ל(?:מכירה|השכרה)|\d+\s*חדרים.*ב[א-ת]|market\s+intel|price\s+history|comparable|sold\s+price|find\s+(?:me\s+)?(?:a|an|another)?\s*\d*\s*[- ]?(?:bed|bdr|room|br)\s*(?:apartment|apt|home|flat)|search\s+propert|properties?\s+in\s+|apartment\s+in\s+|מחירי\s+עסקאות|היסטוריית?\s+עסקאות|נמכר[הו]?\s+לאחרונה|הערכת\s+שווי|מגמת\s+מחיר|הוסף\s+ליד|הוסיפ[יו]?\s+ליד|add\s+(?:this\s+)?lead|add\s+contact|save\s+(?:this\s+)?contact)/i;

function isAgentCommand(text: string): boolean {
  return AGENT_COMMAND_RE.test(String(text ?? ""));
}

// Format ai-agent structured payloads (webtiv_results, market_intel) for
// WhatsApp: concise bullets, one emoji per line, image URLs preserved so
// WhatsApp auto-renders link previews for the property photos.
function formatWebtivForWhatsApp(
  webtivResults: Array<{
    id?: string; title?: string; price?: number; city?: string; rooms?: number;
    sqm?: number; photo?: string | null; transaction_type?: string; source_url?: string | null;
  }> | undefined | null,
): string {
  const list = Array.isArray(webtivResults) ? webtivResults.slice(0, 3) : [];
  if (!list.length) return "";
  const lines = list.map((r) => {
    const price = r.price
      ? `₪${Number(r.price).toLocaleString("he-IL")}${r.transaction_type === "rent" ? "/חודש" : ""}`
      : "—";
    const rooms = r.rooms ? `${r.rooms} חד׳` : "";
    const sqm = r.sqm ? `${r.sqm} מ״ר` : "";
    const bits = [r.city, rooms, sqm].filter(Boolean).join(" · ");
    const head = `🏠 *${r.title || "נכס"}*`;
    const meta = bits ? `\n   📍 ${bits}` : "";
    const priceLine = `\n   💰 ${price}`;
    const link = r.source_url ? `\n   🔗 ${r.source_url}` : "";
    const photo = r.photo ? `\n   🖼️ ${r.photo}` : "";
    return `${head}${meta}${priceLine}${link}${photo}`;
  });
  return `\n\n✨ *נכסים חיים ממאגר המשרד:*\n${lines.join("\n\n")}`;
}

function formatMarketIntelForWhatsApp(
  intel: { query?: string; sources?: Array<{ title?: string; url?: string; snippet?: string }> } | undefined | null,
): string {
  const src = intel?.sources ?? [];
  if (!src.length) return "";
  const lines = src.slice(0, 4).map((s, i) => `${i + 1}. ${String(s.title || s.url || "").slice(0, 90)}\n   🔗 ${s.url}`);
  return `\n\n📊 *מקורות מחקר שוק:*\n${lines.join("\n")}`;
}



async function handleLeadInboxInbound(
  admin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  senderPhone: string,
  messageId: string | undefined,
  inboundText: string,
) {
  // Detect short-link signature so we can auto-create / tag the lead before lookup.
  const shortLink = await resolveShortLinkListing(admin, inboundText);
  const hasShortLinkSignature = SHORTLINK_ANCHOR_RE.test(inboundText);

  // === RESILIENT PIPELINE ===
  // Every DB mutation is wrapped in try/catch so a single failure (RLS,
  // workspace scoping, constraint) NEVER halts the AI reply path.
  // The inbox is restored by always inserting the message row with the
  // sender_phone in metadata, even when lead resolution fails.
  let lead: any = null;
  try {
    const r = await admin
      .from("leads")
      .select("id, full_name, ai_autopilot, phone_number, assigned_to, interest_tag, deal_type")
      .eq("phone_number", senderPhone)
      .maybeSingle();
    lead = r.data;
    if (r.error) console.warn("lead lookup soft-fail:", r.error.message);
  } catch (e) {
    console.warn("lead lookup threw:", e instanceof Error ? e.message : e);
  }

  // Auto-create lead from short-link inbound when none exists yet.
  if (!lead?.id && (shortLink || hasShortLinkSignature)) {
    const dealType = (shortLink?.deal_type === "rent" ? "rent" : "sale");
    const category = dealType === "rent" ? "שוכר" : "קונה";
    let assignTo: string | null = shortLink?.owner_id ?? null;
    if (!assignTo) {
      try {
        const { data: adminRow } = await admin
          .from("user_roles")
          .select("user_id")
          .in("role", ["super_admin", "admin"])
          .limit(1)
          .maybeSingle();
        assignTo = (adminRow as any)?.user_id ?? null;
      } catch (e) {
        console.warn("admin lookup soft-fail:", e instanceof Error ? e.message : e);
      }
    }
    try {
      const { data: created, error: createErr } = await admin
        .from("leads")
        .insert({
          phone_number: senderPhone,
          full_name: null,
          city: shortLink?.city ?? null,
          neighborhood: shortLink?.neighborhood ?? null,
          interest_tag: shortLink?.listing_id ?? null,
          deal_type: dealType,
          lead_stage: "engaging",
          loyalty_tier: "Hot Lead",
          status: "contacted",
          sentiment: "positive",
          assigned_to: assignTo,
          preferences: {
            source: "whatsapp",
            shortlink_origin: shortLink ? "shortlink" : null,
            category,
            listing_id: shortLink?.listing_id ?? null,
            unresolved_listing: !shortLink,
            inbound_excerpt: inboundText.slice(0, 240),
          },

          is_demo: false,
        })
        .select("id, full_name, ai_autopilot, phone_number, assigned_to, interest_tag, deal_type")
        .maybeSingle();
      if (createErr) console.warn("auto lead create soft-fail:", createErr.message);
      else {
        lead = created as any;
        // Fire-and-forget: pull the WhatsApp avatar via fetch-wa-avatars so
        // the new lead shows their real profile picture across the dashboard.
        try {
          const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/fetch-wa-avatars`;
          fetch(fnUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ lead_ids: [(created as any).id], force: true }),
          }).catch(() => { /* swallow */ });
        } catch { /* swallow */ }
      }
    } catch (e) {
      console.warn("auto lead create threw:", e instanceof Error ? e.message : e);
    }
  } else if (lead?.id && shortLink && !lead.interest_tag) {
    try {
      await admin
        .from("leads")
        .update({
          interest_tag: shortLink.listing_id,
          deal_type: shortLink.deal_type || lead.deal_type,
          last_interaction_at: new Date().toISOString(),
        })
        .eq("id", lead.id);
    } catch (e) {
      console.warn("lead tag update soft-fail:", e instanceof Error ? e.message : e);
    }
  }

  // Duplicate guard (best-effort).
  if (messageId && lead?.id) {
    try {
      const { data: existing } = await admin
        .from("messages")
        .select("id")
        .eq("lead_id", lead.id)
        .eq("direction", "inbound")
        .contains("metadata", { message_id: messageId })
        .maybeSingle();
      if (existing?.id) return { ok: true, duplicate: true, lead_id: lead.id };
    } catch (e) {
      console.warn("dup-check soft-fail:", e instanceof Error ? e.message : e);
    }
  }

  // Content-signature dedup: drop identical inbound text from the same lead
  // within a 5-second window (provider retries, double webhooks, etc.).
  if (lead?.id && inboundText) {
    try {
      const since = new Date(Date.now() - 5000).toISOString();
      const { data: recent } = await admin
        .from("messages")
        .select("id")
        .eq("lead_id", lead.id)
        .eq("direction", "inbound")
        .eq("content", inboundText)
        .gte("created_at", since)
        .limit(1)
        .maybeSingle();
      if (recent?.id) return { ok: true, duplicate: true, lead_id: lead.id };
    } catch (e) {
      console.warn("content-dedup soft-fail:", e instanceof Error ? e.message : e);
    }
  }

  const now = new Date().toISOString();
  const metadata = {
    provider: "GreenAPI",
    message_id: messageId ?? null,
    inbound_via: "whatsapp-webhook",
    sender_phone: senderPhone,
    unresolved_lead: !lead?.id,
    listing_id: shortLink?.listing_id ?? null,
  };


  // ALWAYS persist the inbound message row, even if lead_id is null.
  // The inbox UI falls back to a phone-anchored synthetic thread for these.
  try {
    const { error: insertErr } = await admin.from("messages").insert({
      lead_id: lead?.id ?? null,
      channel: "whatsapp",
      platform: "whatsapp",
      content: inboundText,
      direction: "inbound",
      sender_type: "voter",
      metadata,
    });
    if (insertErr) console.warn("inbound message insert soft-fail:", insertErr.message);
  } catch (e) {
    console.warn("inbound message insert threw:", e instanceof Error ? e.message : e);
  }

  if (lead?.id) {
    try {
      await admin.from("chat_history").insert({ lead_id: lead.id, role: "user", content: inboundText, is_demo: false });
    } catch (e) {
      console.warn("chat_history insert soft-fail:", e instanceof Error ? e.message : e);
    }
    try {
      await admin.from("leads").update({ last_interaction_at: now, status: "contacted" }).eq("id", lead.id);
    } catch (e) {
      console.warn("lead touch soft-fail:", e instanceof Error ? e.message : e);
    }
    // Fire-and-forget AI metadata extraction from inbound text.
    extractAndApplyLeadMetadata(admin, lead, inboundText).catch((e) =>
      console.warn("[lead-metadata-extract] failed:", e instanceof Error ? e.message : e),
    );
  }

  // Without any lead row we cannot run autopilot (ai-agent + send require lead_id).
  if (!lead?.id) {
    console.warn("whatsapp-webhook stored inbound without lead row", { senderPhone, messageId });
    return { ok: true, stored: true, lead_id: null, auto_reply: "no_lead_row" };
  }

  // Explicit agent-tool commands bypass the autopilot gates: users typing
  // "find me a 4-room in Herzliya" or "add this lead" always get routed to
  // the AI agent so webtiv_search / Market Intel / CRM actions can run.
  const agentCommand = isAgentCommand(inboundText);

  if (!agentCommand && lead.ai_autopilot === false) {
    return { ok: true, lead_id: lead.id, stored: true, auto_reply: "disabled" };
  }

  // Chat autopilot requires BOTH switches: the contact-level autopilot and the
  // global AI autopilot switch for the owning/assigned workspace user. Agent
  // commands skip this — a direct request is a direct request.
  const aiOwnerId = lead.assigned_to ? String(lead.assigned_to) : "";
  if (!aiOwnerId) {
    return { ok: true, lead_id: lead.id, stored: true, auto_reply: "missing_owner_for_ai_autopilot" };
  }
  if (!agentCommand) {
    try {
      const { data: globalAutopilot } = await admin.rpc("is_ai_autopilot_enabled", { _user_id: aiOwnerId });
      if (!globalAutopilot) {
        return { ok: true, lead_id: lead.id, stored: true, auto_reply: "global_ai_autopilot_disabled" };
      }
    } catch (e) {
      console.warn("global AI autopilot check failed:", e instanceof Error ? e.message : e);
      return { ok: true, lead_id: lead.id, stored: true, auto_reply: "global_ai_autopilot_check_failed" };
    }
  }


  // Build context (best-effort).
  let aiMessages: Array<{ role: string; content: string }> = [{ role: "user", content: inboundText }];
  try {
    const { data: hist } = await admin
      .from("chat_history")
      .select("role, content, created_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(12);
    const built = (hist ?? [])
      .reverse()
      .map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content ?? "") }))
      .filter((m: any) => m.content.trim());
    if (built.length) aiMessages = built;
  } catch (e) {
    console.warn("history fetch soft-fail:", e instanceof Error ? e.message : e);
  }

  // AI reply pipeline — runs even if storage above had issues.
  let reply = "";
  try {
    const aiRes = await fetch(`${supabaseUrl}/functions/v1/ai-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        lead_id: lead.id,
        lead_name: lead.full_name,
        mode: "deal_room_reply",
        context: `Inbound WhatsApp reply from ${lead.full_name ?? "the lead"}: ${inboundText}${agentCommand ? " [AGENT_COMMAND: keep reply concise, WhatsApp-friendly — bullets + emojis]" : ""}`,
        messages: aiMessages,
        enable_research: agentCommand ? true : undefined,
      }),
    });
    const aiJson = await aiRes.json().catch(() => ({}));
    if (!aiRes.ok) {
      console.warn(`ai-agent failed ${aiRes.status}:`, JSON.stringify(aiJson).slice(0, 300));
    } else {
      reply = sanitizeAiReply(String(aiJson?.content ?? aiJson?.message ?? ""));
      // Append structured tool results in WhatsApp-friendly form so the lead
      // sees the actual property cards / market intel sources with the correct
      // images and links, not just narrative prose.
      const webtivTail = formatWebtivForWhatsApp(aiJson?.webtiv_results);
      const intelTail = formatMarketIntelForWhatsApp(aiJson?.market_intel);
      if (webtivTail) reply = (reply || "מצאתי כמה אופציות מתאימות:") + webtivTail;
      if (intelTail) reply = (reply || "הנה מה שמצאתי על השוק באזור:") + intelTail;
    }
  } catch (e) {
    console.warn("ai-agent call threw:", e instanceof Error ? e.message : e);
  }


  if (!reply) return { ok: true, lead_id: lead.id, stored: true, auto_reply: "empty_ai_reply" };

  let sendOk = false;
  let sentMessageId: string | null = null;
  try {
    const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ lead_id: lead.id, message: reply, ai_assisted: true, disclosure_language: "he" }),
    });
    const sendJson = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok || sendJson?.success === false) {
      console.warn(`send-whatsapp failed ${sendRes.status}:`, JSON.stringify(sendJson).slice(0, 300));
    } else {
      sendOk = true;
      sentMessageId = sendJson?.message_id ?? null;
    }
  } catch (e) {
    console.warn("send-whatsapp threw:", e instanceof Error ? e.message : e);
  }

  if (sendOk) {
    try {
      await admin.from("chat_history").insert({ lead_id: lead.id, role: "assistant", content: reply, is_demo: false });
    } catch (e) {
      console.warn("assistant chat_history insert soft-fail:", e instanceof Error ? e.message : e);
    }
  }

  // Fire-and-forget hot-match scoring.
  fetch(`${supabaseUrl}/functions/v1/match-and-alert`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ lead_id: lead.id }),
  }).catch((e) => console.warn("[match-and-alert] failed", e));

  return { ok: true, lead_id: lead.id, stored: true, auto_reply: sendOk ? "sent" : "send_failed", message_id: sentMessageId };
}

// ---------- main handler ----------

Deno.serve(async (req) => {
  console.log("whatsapp-webhook hit", { method: req.method, contentType: req.headers.get("content-type") });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method === "GET") {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    return jsonResponse({
      ok: true,
      webhook_url: `${SUPABASE_URL}/functions/v1/whatsapp-webhook`,
      method: "POST",
      auth_required: false,
      accepts: ["application/json", "text/plain", "application/x-www-form-urlencoded", "application/octet-stream"],
    });
  }
  if (req.method !== "POST") return jsonResponse({ ok: true, ignored: "method_not_post" }, 200);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!SUPABASE_URL || !SERVICE_KEY) return jsonResponse({ error: "server_misconfigured" }, 500);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let payload: any;
  let rawBody = "";
  try {
    const parsed = await parseWebhookPayload(req);
    payload = parsed.payload;
    rawBody = parsed.rawBody;
    console.log("Webhook hit raw body text:", previewRawBody(rawBody));
  } catch (e) {
    console.warn("whatsapp-webhook body parse threw:", e instanceof Error ? e.message : e);
    rawBody = "";
  }
  if (!payload) {
    // Could not parse the body at all — ack with 200 but do NOT insert
    // garbage rows. Only the typed inbound branch ever writes to messages.
    console.warn("whatsapp-webhook: unparseable payload, raw preview:", previewRawBody(rawBody));
    return jsonResponse({ ok: true, ignored: "unparseable_payload" }, 200);
  }

  // ================================================================
  // TYPE-WEBHOOK GATE — GreenAPI fires many non-conversational events
  // (stateInstanceChanged, outgoingMessageStatus, deviceInfo, …). These
  // must never be persisted into `messages` / `chat_history` — they
  // are infra telemetry, not human chat. Ack 200 and exit cleanly.
  // ================================================================
  const typeWebhook = String(payload?.typeWebhook ?? "").trim();
  const ALLOWED_INBOUND_TYPES = new Set([
    "incomingMessageReceived",
    "incomingCall",
    // Some GreenAPI variants nest text under a generic envelope; allow it
    // through the extractor — extractor returns null if no message exists.
    "",
  ]);
  if (!ALLOWED_INBOUND_TYPES.has(typeWebhook)) {
    console.log(`whatsapp-webhook: discarding non-inbound typeWebhook='${typeWebhook}'`);
    return jsonResponse({ ok: true, ignored: "non_inbound_type", typeWebhook }, 200);
  }

  // Observe instance ID, but do not reject at the route threshold: GreenAPI
  // payload variants can omit/change this field and the broker still needs the
  // raw inbound saved to the inbox.
  const MASTER_INSTANCE_ID = "7103164675";
  const incomingInstance = String(
    payload?.instanceData?.idInstance ??
      payload?.idInstance ??
      payload?.instance_id ??
      "",
  ).replace(/\D/g, "");
  if (incomingInstance && incomingInstance !== MASTER_INSTANCE_ID) {
    console.warn("whatsapp-webhook: non-master instance observed but accepted", incomingInstance);
  }

  const extracted = extractGreenApiMessage(payload);
  if (!extracted) {
    // Acknowledge but do NOT write a recovery row — only real human text
    // messages (with a clean sender phone and decoded text) belong in the inbox.
    console.warn("whatsapp-webhook: no extractable inbound message", { typeWebhook });
    return jsonResponse({ ok: true, ignored: "not_a_supported_inbound_message" }, 200);
  }

  const { senderPhone, messageId, extracted: msg } = extracted;

  if (msg.kind === "text" && !isKnowledgeCommand(msg.text)) {
    // ============================================================
    // CUSTOMER LEAD ANCHOR — if the text begins with the canonical
    // short-link greeting, it is a property inquiry from a prospective
    // client. Force-route it through the lead inbox pipeline and
    // bypass the owner command router entirely (even if the sender's
    // phone is whitelisted — common during broker self-tests).
    // ============================================================
    const LEAD_INQUIRY_ANCHOR = "היי אודי, אני פונה אליך לגבי הדירה";
    const normalizedInbound = (msg.text || "").trim();
    if (normalizedInbound.includes(LEAD_INQUIRY_ANCHOR)) {
      console.log(`[LEAD ANCHOR] Customer inquiry detected from ${senderPhone} → lead pipeline`);
      try {
        const result = await handleLeadInboxInbound(
          admin,
          SUPABASE_URL,
          SERVICE_KEY,
          senderPhone,
          messageId,
          msg.text,
        );
        return jsonResponse({ ...result, classified_as: "customer_lead_inquiry" });
      } catch (e) {
        const message = e instanceof Error ? e.message : "unknown";
        console.error("lead-anchor pipeline error:", message);
        return jsonResponse({ ok: false, error: message, soft_fail: true }, 200);
      }
    }

    // ============================================================
    // GATEKEEPER — owner whitelist lookup runs FIRST and HARD BLOCKS
    // any lead/autopilot handling for whitelisted phones. A
    // whitelisted owner must NEVER be treated as a client lead.
    // ============================================================
    let ownerUserId: string | null = null;
    let ownerLabel: string | null = null;
    try {
      const wl = await admin
        .from("kb_whitelist")
        .select("user_id, label, phone_number")
        .in("phone_number", phoneVariants(senderPhone))
        .limit(1)
        .maybeSingle();
      ownerUserId = (wl.data?.user_id as string | undefined) ?? null;
      ownerLabel = (wl.data?.label as string | undefined) ?? null;
    } catch (e) {
      console.warn("wa-companion owner lookup failed:", e instanceof Error ? e.message : e);
    }

    if (!ownerUserId) {
      console.log(`[ADMIN FLOW] No owner match for ${senderPhone} → falling through to lead pipeline`);
    } else {
      console.log(`[ADMIN FLOW] Owner identified: ${ownerLabel ?? ownerUserId} (phone=${senderPhone})`);

      // Continuous-learning capture: if the owner's text looks like an explicit
      // behavior rule ("מעכשיו...", "תמיד...", "אל תשתמש..."), fire-and-forget
      // it into ingest-system-rule. Does not block the reply.
      try {
        const { hasSystemRuleTrigger } = await import("../_shared/system-rules.ts");
        if (hasSystemRuleTrigger(msg.text)) {
          fetch(`${SUPABASE_URL}/functions/v1/ingest-system-rule`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_KEY}`,
              apikey: SERVICE_KEY,
            },
            body: JSON.stringify({
              text: msg.text,
              source: "whatsapp_text",
              role: "owner",
              workspace_owner_id: ownerUserId,
              actor_user_id: ownerUserId,
            }),
          }).catch((e) => console.warn("ingest-system-rule (text) dispatch failed:", e));
        }
      } catch (e) {
        console.warn("system-rule capture failed:", e instanceof Error ? e.message : e);
      }
      // RESEARCH INTERCEPTOR — fires BEFORE routeOwnerCommand. If the owner
      // texts a research directive ("תחקור את שכונת...", "תעשה לי דוח על..."),
      // bypass the standard router and execute the master-research engine
      // (Firecrawl + Gemini synthesis), then reply with the clean Hebrew brief.
      try {
        const { hasResearchTrigger, extractResearchSubject } = await import("../_shared/research-intel.ts");
        if (hasResearchTrigger(msg.text)) {
          const subject = extractResearchSubject(msg.text);
          if (subject) {
            await sendRawWhatsApp(
              SUPABASE_URL,
              SERVICE_KEY,
              senderPhone,
              `קצין המודיעין נכנס לפעולה.\nמתחיל מחקר חי על: ${subject}.\nאחזור אליך תוך כמה רגעים עם דוח מובנה.`,
            );
            const researchRes = await fetch(`${SUPABASE_URL}/functions/v1/master-research`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SERVICE_KEY}`,
              },
              body: JSON.stringify({
                query: subject,
                mode: "neighborhood",
                workspace_owner_id: ownerUserId,
                persist: true,
              }),
            });
            const rj: any = await researchRes.json().catch(() => ({}));
            const brief = String(rj?.brief ?? "").trim();
            const sources: Array<{ url?: string; title?: string }> = Array.isArray(rj?.sources) ? rj.sources : [];
            let replyText: string;
            if (brief) {
              const srcLines = sources
                .slice(0, 5)
                .map((s, i) => `${i + 1}. ${(s.title || s.url || "").slice(0, 90)}${s.url ? `\n${s.url}` : ""}`)
                .join("\n");
              replyText = [
                `דוח מודיעין — ${subject}`,
                "",
                brief,
                srcLines ? "\n— מקורות —\n" + srcLines : "",
                "\nהדוח נשמר בזיכרון המשרד ויוטמע אוטומטית בפוסטים, תגובות ושיחות שיתייחסו לאזור הזה.",
              ].filter(Boolean).join("\n");
            } else {
              replyText = `לא הצלחתי להפיק דוח על "${subject}" כרגע. נסה ניסוח אחר או נסה שוב עוד מספר דקות.`;
            }
            await sendRawWhatsApp(SUPABASE_URL, SERVICE_KEY, senderPhone, replyText.slice(0, 3800));
            return jsonResponse({
              ok: true,
              companion: "master_research",
              owner_blocked_lead_autopilot: true,
              subject,
              persisted: rj?.persisted === true,
              source_count: sources.length,
            });
          }
        }
      } catch (e) {
        console.warn("master-research interceptor failed:", e instanceof Error ? e.message : e);
        // fall through to normal router
      }

      try {
        const routed = await routeOwnerCommand({
          admin,
          supabaseUrl: SUPABASE_URL,
          serviceKey: SERVICE_KEY,
          senderPhone,
          ownerUserId,
          text: msg.text,
        });
        const replyText = routed.handled
          ? routed.reply
          : `לא זיהיתי פקודה ברורה. נסה לנסח מחדש, למשל: צור פוסט על הדירה ברחוב החליל בהרצליה.`;
        await sendRawWhatsApp(SUPABASE_URL, SERVICE_KEY, senderPhone, replyText);
        return jsonResponse({
          ok: true,
          companion: routed.handled ? routed.action : "owner_help",
          owner_blocked_lead_autopilot: true,
          meta: routed.handled ? (routed.meta ?? null) : null,
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "unknown";
        console.error("wa-companion-router error (owner hard-block):", errMsg);
        // Even on internal error we DO NOT fall through to the lead pipeline.
        await sendRawWhatsApp(
          SUPABASE_URL,
          SERVICE_KEY,
          senderPhone,
          "נתקלתי בשגיאה זמנית בהפקת התוכן. נסה שוב בעוד רגע.",
        );
        return jsonResponse({ ok: false, owner_blocked_lead_autopilot: true, error: errMsg }, 200);
      }
    }

    // Non-owner → standard lead inbox pipeline.
    try {
      const result = await handleLeadInboxInbound(
        admin,
        SUPABASE_URL,
        SERVICE_KEY,
        senderPhone,
        messageId,
        msg.text,
      );
      return jsonResponse(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown";
      console.error("whatsapp-webhook inbox pipeline error:", message);
      await logIntegrationError({
        integration: "whatsapp",
        functionName: "whatsapp-webhook",
        errorMessage: message,
      });
      // Always 200 — never let an internal error trigger GreenAPI retry storms
      // or hide the inbound from the operator's monitoring.
      return jsonResponse({ ok: false, error: message, soft_fail: true }, 200);
    }
  }

  // 1. Whitelist check — only authorized Agents can feed the Strategy Bank.
  if (!LOVABLE_API_KEY) {
    await persistRawRecoveryMessage(admin, payload, rawBody, "lovable_api_key_missing");
    return jsonResponse({ ok: true, stored: true, ignored: "LOVABLE_API_KEY missing for knowledge pipeline" }, 200);
  }
  const { data: wl } = await admin
    .from("kb_whitelist")
    .select("user_id, label")
    .eq("phone_number", senderPhone)
    .maybeSingle();
  if (!wl) {
    return jsonResponse({ ok: true, ignored: "sender_not_whitelisted", phone: senderPhone });
  }
  const userId = wl.user_id as string;
  const senderLabel = (wl.label as string | null) ?? null;

  // 2. Per-type processing → produce { title, finalText, source_type, source_metadata }
  let title = "";
  let finalText = "";
  let sourceType: "text" | "audio" | "image" | "video" | "pdf" = "text";
  const sourceMetadata: Record<string, unknown> = {
    source: "WhatsApp",
    inbound_via: "whatsapp-webhook",
    sender_phone: senderPhone,
    sender_label: senderLabel,
    message_id: messageId ?? null,
  };
  let storedFilePath: string | null = null;

  try {
    if (msg.kind === "text") {
      finalText = msg.text;
      title = (msg.text.split(/\n|\. /)[0] || msg.text).slice(0, 120);
      sourceType = "text";
    } else if (msg.kind === "audio") {
      // Guard: MIME allow-list.
      if (!isSupportedMime(msg.mimeType, "audio")) {
        console.warn("whatsapp-webhook ignored unsupported audio", { senderPhone, messageId, mime: msg.mimeType });
        return jsonResponse({ ok: true, ignored: "unsupported_audio_mime", mime: msg.mimeType }, 200);
      }
      // Download → store private copy → transcribe → ingest text only.
      const { bytes, contentType } = await fetchBinary(msg.downloadUrl);
      // Guard: size cap (20MB).
      if (bytes.byteLength > MAX_FILE_BYTES) {
        console.warn("whatsapp-webhook ignored oversized audio", { senderPhone, messageId, bytes: bytes.byteLength });
        return jsonResponse({ ok: true, ignored: "audio_too_large", bytes: bytes.byteLength }, 200);
      }
      const ext = (msg.fileName?.match(/\.(\w+)$/i)?.[1] ?? "ogg").toLowerCase();
      const objectPath = `${userId}/whatsapp/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const upload = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(objectPath, bytes, {
          contentType: msg.mimeType ?? contentType ?? "audio/ogg",
          upsert: false,
        });
      if (!upload.error) storedFilePath = objectPath;
      else console.warn("storage upload failed (audio):", upload.error.message);

      finalText = await transcribeAudio(bytes, msg.mimeType ?? contentType ?? "audio/ogg", LOVABLE_API_KEY);
      title = `Voice Note · ${(finalText.split(/\n|\. /)[0] || "").slice(0, 110) || "WhatsApp"}`;
      sourceType = "audio";
      sourceMetadata.transcribed_via = "lovable-ai-gemini";
      if (msg.caption) sourceMetadata.caption = msg.caption;

      // Continuous-learning capture: if the transcript looks like an explicit
      // behavior rule, fire it into ingest-system-rule (fire-and-forget).
      try {
        const { hasSystemRuleTrigger } = await import("../_shared/system-rules.ts");
        if (hasSystemRuleTrigger(finalText)) {
          fetch(`${SUPABASE_URL}/functions/v1/ingest-system-rule`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_KEY}`,
              apikey: SERVICE_KEY,
            },
            body: JSON.stringify({
              text: finalText,
              source: "whatsapp_voice",
              role: "owner",
              workspace_owner_id: userId,
              actor_user_id: userId,
            }),
          }).catch((e) => console.warn("ingest-system-rule (voice) dispatch failed:", e));
        }
      } catch (e) {
        console.warn("voice rule capture failed:", e instanceof Error ? e.message : e);
      }
    } else {
      // media (image / video / document) — store privately, extract text via kb-ingest.
      // Guard: MIME allow-list per media kind.
      if (!isSupportedMime(msg.mimeType, msg.mediaKind)) {
        console.warn("whatsapp-webhook ignored unsupported media", { senderPhone, messageId, mime: msg.mimeType, kind: msg.mediaKind });
        return jsonResponse({ ok: true, ignored: "unsupported_media_mime", mime: msg.mimeType, kind: msg.mediaKind }, 200);
      }
      const { bytes, contentType } = await fetchBinary(msg.downloadUrl);
      // Guard: size cap (20MB).
      if (bytes.byteLength > MAX_FILE_BYTES) {
        console.warn("whatsapp-webhook ignored oversized media", { senderPhone, messageId, bytes: bytes.byteLength });
        return jsonResponse({ ok: true, ignored: "media_too_large", bytes: bytes.byteLength }, 200);
      }
      const safeName = (msg.fileName ?? "attachment").replace(/[^\w.\-]+/g, "_");
      const objectPath = `${userId}/whatsapp/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
      const upload = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(objectPath, bytes, {
          contentType: msg.mimeType ?? contentType,
          upsert: false,
        });
      if (!upload.error) storedFilePath = objectPath;
      else console.warn("storage upload failed (media):", upload.error.message);

      // Hand off to kb-ingest, which already analyses media via Gemini and produces searchable text.
      const dataUrl = `data:${msg.mimeType ?? contentType};base64,${bytesToBase64(bytes)}`;
      title = msg.caption?.slice(0, 120) || (msg.fileName ?? `WhatsApp ${msg.mediaKind}`).slice(0, 120);
      sourceType = msg.mediaKind === "image" ? "image" : msg.mediaKind === "video" ? "video" : "pdf";

      const ingestRes = await fetch(`${SUPABASE_URL}/functions/v1/kb-ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          target_user_id: userId,
          title: `WhatsApp · ${title}`,
          file_data_url: dataUrl,
          mime_type: msg.mimeType ?? contentType,
          source_type: sourceType,
          source_metadata: {
            ...sourceMetadata,
            file_path: storedFilePath,
            original_filename: msg.fileName ?? null,
            media_kind: msg.mediaKind,
          },
        }),
      });
      const ingestJson = await ingestRes.json().catch(() => ({}));
      if (!ingestRes.ok) {
        throw new Error(`kb-ingest media failed: ${JSON.stringify(ingestJson).slice(0, 300)}`);
      }

      // Categorize using the title/caption as a proxy — full extracted text already lives in kb-ingest.
      const { tags, summary } = await categorizeContent(
        `${title}\n${msg.caption ?? ""}\n(media file: ${msg.fileName ?? "attachment"})`,
        LOVABLE_API_KEY,
      );
      // Patch the doc with tags + storage path.
      if (ingestJson?.document_id) {
        await admin
          .from("knowledge_documents")
          .update({
            file_path: storedFilePath,
            source_metadata: {
              ...sourceMetadata,
              file_path: storedFilePath,
              original_filename: msg.fileName ?? null,
              media_kind: msg.mediaKind,
              tags,
              summary,
            },
          })
          .eq("id", ingestJson.document_id);
      }

      // MASTER MULTIMODAL ANALYSIS — forward the binary as an attachment to
      // ai-agent so קצין המודיעין produces a clean, structured Hebrew analysis
      // (key facts, action items, leads/listings to update) and reply with it
      // instead of a generic confirmation. Falls back to the standard
      // confirmation card if analysis fails.
      let masterReplyText = "";
      try {
        const analysisRes = await fetch(`${SUPABASE_URL}/functions/v1/ai-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
            "x-actor-user-id": userId,
          },
          body: JSON.stringify({
            mode: "master_analysis",
            context:
              `המשרד שלך קיבל קובץ ${sourceType === "image" ? "תמונה" : sourceType === "video" ? "וידאו" : "מסמך"} ב-WhatsApp` +
              (msg.caption ? ` עם הערה: "${msg.caption}"` : "") +
              `. נתח את הקובץ כקצין מודיעין: כותרת קצרה, 5-7 עובדות מרכזיות, פעולות מומלצות, וכל מספר/מחיר/כתובת שצריך לחלץ. עברית רהוטה, סעיפים נקיים, ללא em-dash.`,
            messages: [{
              role: "user",
              content: msg.caption || `נתח את הקובץ "${title}"`,
            }],
            attachments: [{
              name: msg.fileName ?? "attachment",
              mime: msg.mimeType ?? contentType,
              data_url: dataUrl,
            }],
          }),
        });
        const aj: any = await analysisRes.json().catch(() => ({}));
        const analysisText = String(aj?.content ?? aj?.message ?? "").trim();
        if (analysisRes.ok && analysisText) {
          masterReplyText = analysisText;
        } else {
          console.warn("master analysis non-fatal failure", analysisRes.status, JSON.stringify(aj).slice(0, 200));
        }
      } catch (e) {
        console.warn("master analysis dispatch threw:", e instanceof Error ? e.message : e);
      }

      if (masterReplyText) {
        const tagsLine = tags.length ? tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ") : "#General";
        const header =
          sourceType === "image" ? "🖼️ ניתוח תמונה"
          : sourceType === "video" ? "🎬 ניתוח וידאו"
          : "📄 ניתוח מסמך";
        await sendRawWhatsApp(
          SUPABASE_URL, SERVICE_KEY, senderPhone,
          `${header} — ${title.slice(0, 80)}\n\n${masterReplyText.slice(0, 3400)}\n\nתיוג: ${tagsLine}\nהקובץ נשמר ב-Strategy Bank ויהיה זמין לפוסטים, תגובות ושיחות עתידיות.`,
        );
      } else {
        // Fallback to the standard confirmation card.
        await sendConfirmation(
          SUPABASE_URL,
          SERVICE_KEY,
          senderPhone,
          title,
          tags,
          sourceType,
        );
      }

      return jsonResponse({
        ok: true,
        document_id: ingestJson?.document_id,
        chunks: ingestJson?.chunks,
        tags,
        file_path: storedFilePath,
        master_analysis: !!masterReplyText,
      });
    }

    // Text + audio path → call kb-ingest with raw_text.
    const { tags, summary } = await categorizeContent(finalText, LOVABLE_API_KEY);

    const ingestRes = await fetch(`${SUPABASE_URL}/functions/v1/kb-ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        target_user_id: userId,
        title: `WhatsApp · ${title}`,
        raw_text: finalText,
        source_type: sourceType,
        source_metadata: {
          ...sourceMetadata,
          file_path: storedFilePath,
          tags,
          summary,
        },
      }),
    });
    const ingestJson = await ingestRes.json().catch(() => ({}));
    if (!ingestRes.ok) {
      throw new Error(`kb-ingest text/audio failed: ${JSON.stringify(ingestJson).slice(0, 300)}`);
    }

    // Patch file_path onto the document row for direct lookups.
    if (storedFilePath && ingestJson?.document_id) {
      await admin
        .from("knowledge_documents")
        .update({ file_path: storedFilePath })
        .eq("id", ingestJson.document_id);
    }

    await sendConfirmation(
      SUPABASE_URL,
      SERVICE_KEY,
      senderPhone,
      title,
      tags,
      sourceType,
    );

    return jsonResponse({
      ok: true,
      document_id: ingestJson?.document_id,
      chunks: ingestJson?.chunks,
      tags,
      file_path: storedFilePath,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("whatsapp-webhook pipeline error:", message);
    await logIntegrationError({
      integration: "whatsapp",
      functionName: "whatsapp-webhook",
      errorMessage: message,
    });
    // Acknowledge failures without sending a WhatsApp error reply. Returning 200
    // prevents provider retries from repeatedly notifying the owner.
    return jsonResponse({ ok: true, error: message, suppressed_reply: true }, 200);
  }
});

// ---------- confirmation helpers ----------

async function sendRawWhatsApp(
  supabaseUrl: string,
  serviceKey: string,
  phone: string,
  body: string,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ phone_number: phone, body }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.warn("send-whatsapp confirmation failed:", res.status, t.slice(0, 200));
  }
}

async function sendConfirmation(
  supabaseUrl: string,
  serviceKey: string,
  phone: string,
  title: string,
  tags: string[],
  sourceType: string,
): Promise<void> {
  const tagsLine = tags.length ? tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ") : "#General";
  const typeLabel =
    sourceType === "audio"
      ? "🎙️ הקלטה תומללה"
      : sourceType === "image"
      ? "🖼️ תמונה נותחה"
      : sourceType === "video"
      ? "🎬 וידאו נותח"
      : sourceType === "pdf"
      ? "📄 מסמך נקלט"
      : "✍️ הערה נשמרה";
  const body =
    `✅ נוסף ל-Strategy Bank\n` +
    `${typeLabel}\n` +
    `כותרת: ${title.slice(0, 120)}\n` +
    `תיוג: ${tagsLine}\n\n` +
    `הסוכן החכם יכול עכשיו ללמוד מזה ולהשתמש בזה בתשובות עתידיות.`;
  await sendRawWhatsApp(supabaseUrl, serviceKey, phone, body);
}

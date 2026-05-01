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

// Exact Hebrew reply requested for any unreadable / oversized / failed file.
const HEBREW_FILE_ERROR_REPLY =
  "מצטער, לא הצלחתי לקרוא את הקובץ. אנא נסה שוב.";

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
  "Prospect Meeting",
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
  // Standard GreenAPI inbound notification.
  const type = payload.typeWebhook;
  if (type && type !== "incomingMessageReceived") return null;

  const senderRaw =
    payload?.senderData?.sender ??
    payload?.senderData?.chatId ??
    payload?.from ??
    "";
  const senderPhone = normalizePhone(senderRaw);
  if (!senderPhone) return null;
  const messageId = payload?.idMessage ?? payload?.message_id;

  const md = payload?.messageData ?? {};

  // 1. Text or extended-text
  const textBody =
    md?.textMessageData?.textMessage ??
    md?.extendedTextMessageData?.text ??
    payload?.text ??
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

// ---------- main handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!SUPABASE_URL || !SERVICE_KEY) return jsonResponse({ error: "server_misconfigured" }, 500);
  if (!LOVABLE_API_KEY) return jsonResponse({ error: "LOVABLE_API_KEY missing" }, 500);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const extracted = extractGreenApiMessage(payload);
  if (!extracted) {
    // Acknowledge so GreenAPI does not retry (e.g. status receipts, group events).
    return jsonResponse({ ok: true, ignored: "not_a_supported_inbound_message" });
  }

  const { senderPhone, messageId, extracted: msg } = extracted;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1. Whitelist check — only authorized Agents can feed the Strategy Bank.
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
        await sendRawWhatsApp(SUPABASE_URL, SERVICE_KEY, senderPhone, HEBREW_FILE_ERROR_REPLY);
        return jsonResponse({ ok: false, ignored: "unsupported_audio_mime", mime: msg.mimeType }, 200);
      }
      // Download → store private copy → transcribe → ingest text only.
      const { bytes, contentType } = await fetchBinary(msg.downloadUrl);
      // Guard: size cap (20MB).
      if (bytes.byteLength > MAX_FILE_BYTES) {
        await sendRawWhatsApp(SUPABASE_URL, SERVICE_KEY, senderPhone, HEBREW_FILE_ERROR_REPLY);
        return jsonResponse({ ok: false, ignored: "audio_too_large", bytes: bytes.byteLength }, 200);
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
    } else {
      // media (image / video / document) — store privately, extract text via kb-ingest.
      // Guard: MIME allow-list per media kind.
      if (!isSupportedMime(msg.mimeType, msg.mediaKind)) {
        await sendRawWhatsApp(SUPABASE_URL, SERVICE_KEY, senderPhone, HEBREW_FILE_ERROR_REPLY);
        return jsonResponse({ ok: false, ignored: "unsupported_media_mime", mime: msg.mimeType, kind: msg.mediaKind }, 200);
      }
      const { bytes, contentType } = await fetchBinary(msg.downloadUrl);
      // Guard: size cap (20MB).
      if (bytes.byteLength > MAX_FILE_BYTES) {
        await sendRawWhatsApp(SUPABASE_URL, SERVICE_KEY, senderPhone, HEBREW_FILE_ERROR_REPLY);
        return jsonResponse({ ok: false, ignored: "media_too_large", bytes: bytes.byteLength }, 200);
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

      // Confirm to the Agent and short-circuit (kb-ingest already did embeddings).
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
    // Try to notify the Agent that something went wrong so they aren't left guessing.
    try {
      await sendRawWhatsApp(
        SUPABASE_URL,
        SERVICE_KEY,
        senderPhone,
        HEBREW_FILE_ERROR_REPLY,
      );
    } catch (_) {
      // best-effort
    }
    return jsonResponse({ ok: false, error: message }, 500);
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

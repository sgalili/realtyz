/**
 * Inbound WhatsApp voice → Hebrew text.
 *
 * Meta delivers voice notes as a media id only. To turn one into a chat message
 * the AI can answer we must:
 *   1. resolve a Cloud API access token for the receiving number,
 *   2. GET /{media-id} to obtain the (short-lived, auth-required) download URL,
 *   3. download the audio bytes,
 *   4. transcribe them through the Lovable AI Gateway STT endpoint.
 *
 * Every failure is soft: the caller keeps the original "[הודעה קולית]" content
 * instead of dropping the message.
 */
import { logIntegrationError } from "./logIntegrationError.ts";

const STT_MODEL = "openai/gpt-4o-transcribe";
const MAX_BYTES = 24 * 1024 * 1024;

type Admin = { from: (t: string) => any };

export interface WaMediaCreds {
  accessToken: string;
  apiVersion: string;
}

function envCreds(): WaMediaCreds | null {
  const accessToken =
    Deno.env.get("META_WA_ACCESS_TOKEN") ?? Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
  if (!accessToken) return null;
  return {
    accessToken,
    apiVersion:
      Deno.env.get("META_WA_API_VERSION") ??
      Deno.env.get("META_API_VERSION") ??
      Deno.env.get("WHATSAPP_API_VERSION") ??
      "v26.0",
  };
}

/** Find a Cloud API token that can read media for this phone_number_id. */
export async function resolveWaMediaCreds(
  admin: Admin,
  phoneNumberId: string | null,
  ownerId: string | null,
): Promise<WaMediaCreds | null> {
  try {
    const { data: rows } = await admin
      .from("wa_providers")
      .select("user_id, tenant_id, config")
      .eq("provider_name", "WBA");
    const list = (rows ?? []) as Array<{ user_id: string | null; tenant_id: string | null; config: any }>;
    const usable = list.filter((r) => r?.config?.access_token);
    const byPhone = usable.find(
      (r) => phoneNumberId && String(r.config?.phone_number_id ?? "") === phoneNumberId,
    );
    const byOwner = usable.find(
      (r) => ownerId && (r.user_id === ownerId || r.tenant_id === ownerId),
    );
    const hit = byPhone ?? byOwner ?? (usable.length === 1 ? usable[0] : undefined);
    if (hit) {
      return {
        accessToken: String(hit.config.access_token),
        apiVersion: String(hit.config.api_version ?? "v26.0"),
      };
    }
  } catch (e) {
    console.warn("[wa-stt] provider lookup failed", e instanceof Error ? e.message : e);
  }
  return envCreds();
}

function extFor(mime: string): string {
  const m = (mime || "").split(";")[0].toLowerCase();
  return ({
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
    "audio/amr": "amr",
    "audio/wav": "wav",
    "audio/webm": "webm",
  } as Record<string, string>)[m] ?? "ogg";
}

/**
 * Download an inbound WhatsApp voice note and return its Hebrew transcript.
 * Returns null when the media cannot be read or the STT call fails.
 */
export async function transcribeWaVoiceNote(
  admin: Admin,
  opts: { mediaId: string; phoneNumberId?: string | null; ownerId?: string | null; language?: string },
): Promise<string | null> {
  const mediaId = String(opts.mediaId ?? "").trim();
  if (!mediaId) return null;

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) {
    console.warn("[wa-stt] LOVABLE_API_KEY missing — voice note left untranscribed");
    return null;
  }

  const creds = await resolveWaMediaCreds(admin, opts.phoneNumberId ?? null, opts.ownerId ?? null);
  if (!creds) {
    console.warn("[wa-stt] no Meta Cloud API token available for media download");
    return null;
  }

  try {
    // 1. media id → download URL
    const metaRes = await fetch(
      `https://graph.facebook.com/${creds.apiVersion}/${mediaId}`,
      { headers: { Authorization: `Bearer ${creds.accessToken}` } },
    );
    if (!metaRes.ok) {
      throw new Error(`media lookup ${metaRes.status}: ${(await metaRes.text()).slice(0, 300)}`);
    }
    const meta = await metaRes.json();
    const mediaUrl = String(meta?.url ?? "");
    if (!mediaUrl) throw new Error("media lookup returned no url");

    // 2. download bytes (Graph requires the same bearer token here)
    const binRes = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${creds.accessToken}`, "User-Agent": "realtyz-stt/1.0" },
    });
    if (!binRes.ok) {
      throw new Error(`media download ${binRes.status}`);
    }
    const buf = new Uint8Array(await binRes.arrayBuffer());
    if (buf.byteLength < 512) throw new Error("empty audio payload");
    if (buf.byteLength > MAX_BYTES) throw new Error("audio too large");
    const mime = String(meta?.mime_type ?? binRes.headers.get("content-type") ?? "audio/ogg");
    const blob = new Blob([buf], { type: mime.split(";")[0] });

    // 3. transcribe
    const form = new FormData();
    form.append("model", STT_MODEL);
    form.append("file", blob, `voice.${extFor(mime)}`);
    const lang = (opts.language ?? "he").trim().slice(0, 2).toLowerCase();
    if (/^(he|en)$/.test(lang)) form.append("language", lang);

    const sttRes = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}` },
      body: form,
    });
    if (!sttRes.ok) {
      const detail = (await sttRes.text().catch(() => "")).slice(0, 400);
      await logIntegrationError({
        integration: "transcription",
        functionName: "wa-voice-stt",
        errorCode: sttRes.status,
        errorMessage: `WhatsApp voice transcription failed: ${detail || sttRes.status}`,
        context: { media_id: mediaId },
      });
      return null;
    }
    const out = await sttRes.json().catch(() => ({}));
    const text = String(out?.text ?? "").trim();
    if (!text) return null;
    console.log("[wa-stt] transcribed voice note", { media_id: mediaId, chars: text.length });
    return text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[wa-stt] failed", msg);
    await logIntegrationError({
      integration: "transcription",
      functionName: "wa-voice-stt",
      errorMessage: `WhatsApp voice transcription error: ${msg}`,
      context: { media_id: mediaId },
    });
    return null;
  }
}

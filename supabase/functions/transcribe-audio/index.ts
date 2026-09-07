// Speech-to-text via Lovable AI Gateway (/v1/audio/transcriptions).
// Accepts EITHER:
//   - multipart/form-data with a `file` part (+ optional `language`)
//   - JSON { audio_data_url: string, mime_type?: string, language?: string }
// Returns { text: string }
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "openai/gpt-4o-transcribe";
const MAX_BYTES = 24 * 1024 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function extFor(mime: string): string {
  const m = (mime || "").split(";")[0].toLowerCase();
  return ({
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
  } as Record<string, string>)[m] ?? "wav";
}

/**
 * Parses a data URL. Tolerant of extra media-type parameters, which browsers
 * DO emit: `data:audio/webm;codecs=opus;base64,...` is perfectly valid, so the
 * `;base64` marker may sit after other parameters, not directly after the MIME.
 */
function dataUrlToBlob(dataUrl: string, fallbackMime?: string): Blob {
  const url = String(dataUrl ?? "").trim();
  const comma = url.indexOf(",");
  if (!url.startsWith("data:") || comma < 0) {
    throw new Error("audio_data_url is not a valid data URL");
  }
  const header = url.slice(5, comma);
  const raw = url.slice(comma + 1);
  if (!raw) throw new Error("empty_recording");

  const params = header.split(";").map((p) => p.trim());
  const isBase64 = params.some((p) => p.toLowerCase() === "base64");
  const mime = (params[0] && params[0].includes("/") ? params[0] : "") || fallbackMime || "audio/wav";

  if (!isBase64) return new Blob([decodeURIComponent(raw)], { type: mime });

  let bin: string;
  try {
    bin = atob(raw.replace(/\s/g, ""));
  } catch {
    throw new Error("audio_data_url base64 payload could not be decoded");
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const contentType = req.headers.get("content-type") ?? "";
    let audio: Blob;
    let language: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return json({ error: "missing `file` part" }, 400);
      audio = file;
      const lang = form.get("language");
      language = typeof lang === "string" ? lang : undefined;
    } else {
      const body = await req.json().catch(() => null) as
        | { audio_data_url?: string; mime_type?: string; language?: string }
        | null;
      if (!body?.audio_data_url) return json({ error: "missing `audio_data_url`" }, 400);
      audio = dataUrlToBlob(body.audio_data_url, body.mime_type);
      language = body.language;
    }

    if (audio.size < 1024) return json({ error: "empty_recording" }, 400);
    if (audio.size > MAX_BYTES) return json({ error: "audio too large (max 24MB)" }, 400);

    const upstream = new FormData();
    upstream.append("model", MODEL);
    upstream.append("file", audio, `recording.${extFor(audio.type)}`);
    // Bare ISO-639-1 only; anything else (or "auto") must be omitted so the model detects it.
    const lang = (language ?? "").trim().slice(0, 2).toLowerCase();
    if (/^(he|en)$/.test(lang)) upstream.append("language", lang);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: upstream,
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 600);
      await logIntegrationError({
        integration: "transcription",
        functionName: "transcribe-audio",
        errorCode: res.status,
        errorMessage: detail,
      });
      return json({ error: `transcription failed: ${detail || res.status}` }, res.status);
    }

    const out = await res.json().catch(() => ({}));
    const text: string = (out?.text ?? "").trim();
    return json({ text });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("transcribe-audio error:", message);
    await logIntegrationError({
      integration: "transcription",
      functionName: "transcribe-audio",
      errorMessage: message,
    });
    return json({ error: message }, 500);
  }
});

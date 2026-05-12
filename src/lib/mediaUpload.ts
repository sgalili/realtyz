import { supabase } from "@/integrations/supabase/client";

export type MediaKind = "image" | "video" | "audio" | "document" | "other";

export function detectMediaKind(fileName: string, mime?: string): MediaKind {
  const m = (mime ?? "").toLowerCase();
  const n = fileName.toLowerCase();
  if (m.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(n)) return "image";
  if (m.startsWith("video/") || /\.(mp4|mov|m4v|webm|3gp|avi|mkv)$/i.test(n)) return "video";
  if (m.startsWith("audio/") || /\.(mp3|m4a|ogg|opus|wav|aac)$/i.test(n)) return "audio";
  if (m === "application/pdf" || /\.(pdf|docx?|xlsx?|pptx?|txt|csv)$/i.test(n)) return "document";
  return "other";
}

function guessMime(fileName: string, fallback?: string): string {
  if (fallback && fallback !== "application/octet-stream") return fallback;
  const n = fileName.toLowerCase();
  const ext = n.split(".").pop() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", heic: "image/heic", bmp: "image/bmp",
    mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v",
    webm: "video/webm", "3gp": "video/3gpp", avi: "video/x-msvideo", mkv: "video/x-matroska",
    mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", opus: "audio/opus",
    wav: "audio/wav", aac: "audio/aac",
    pdf: "application/pdf", txt: "text/plain", csv: "text/csv",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext] ?? fallback ?? "application/octet-stream";
}

export interface UploadMediaInput {
  userId: string;
  fileName: string;
  data: Blob | ArrayBuffer | Uint8Array;
  mimeType?: string;
  source?: string;
  sourceMetadata?: Record<string, unknown>;
}

export async function uploadMediaToLibrary(input: UploadMediaInput) {
  const mime = guessMime(input.fileName, input.mimeType);
  const kind = detectMediaKind(input.fileName, mime);
  const safeName = input.fileName.replace(/[^\w.\-]+/g, "_");
  const path = `${input.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const blob =
    input.data instanceof Blob
      ? input.data
      : new Blob(
          [input.data instanceof Uint8Array ? new Uint8Array(input.data).buffer : input.data],
          { type: mime },
        );

  const { error: upErr } = await supabase.storage
    .from("media-library")
    .upload(path, blob, { contentType: mime, upsert: false });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from("media-library").getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  const { data: row, error: insErr } = await supabase
    .from("media_library")
    .insert([
      {
        user_id: input.userId,
        file_name: input.fileName,
        storage_path: path,
        public_url: publicUrl,
        mime_type: mime,
        size_bytes: blob.size,
        media_kind: kind,
        source: input.source ?? null,
        source_metadata: JSON.parse(JSON.stringify(input.sourceMetadata ?? {})),
      },
    ])
    .select()
    .single();
  if (insErr) throw insErr;

  return row;
}

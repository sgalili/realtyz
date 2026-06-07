// Manage ElevenLabs voices for the broker: upload-clone a new voice from
// an audio sample, or register an existing ElevenLabs Voice ID. Persists
// the result to public.cloned_voices for the calling user.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",")[1] : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const action = String(body?.action ?? "");
  const name = String(body?.name ?? "").trim().slice(0, 80);
  if (!name) return json({ error: "name_required" }, 400);

  try {
    if (action === "clone_from_upload") {
      if (!apiKey) return json({ error: "missing_elevenlabs_api_key" }, 500);
      const audioB64 = String(body?.audio_base64 ?? "");
      const mime = String(body?.mime ?? "audio/mpeg");
      const filename = String(body?.filename ?? "sample.mp3");
      if (!audioB64) return json({ error: "audio_required" }, 400);
      const bytes = b64ToBytes(audioB64);
      if (bytes.byteLength > 8 * 1024 * 1024) {
        return json({ error: "file_too_large", max_mb: 8 }, 413);
      }

      const fd = new FormData();
      fd.append("name", name);
      fd.append("files", new Blob([bytes], { type: mime }), filename);
      fd.append("description", `Cloned via Realtyz AI by ${user.email ?? user.id}`);

      const r = await fetch("https://api.elevenlabs.io/v1/voices/add", {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: fd,
      });
      const txt = await r.text();
      if (!r.ok) return json({ error: "elevenlabs_failed", status: r.status, detail: txt }, 502);
      const parsed = JSON.parse(txt);
      const voiceId = parsed?.voice_id;
      if (!voiceId) return json({ error: "no_voice_id", detail: parsed }, 502);

      const { data: row, error: insErr } = await supabase
        .from("cloned_voices")
        .insert({ user_id: user.id, name, voice_id: voiceId, source: "upload" })
        .select("*").single();
      if (insErr) return json({ error: "db_insert_failed", detail: insErr.message }, 500);
      return json({ voice: row });
    }

    if (action === "register_voice_id") {
      const voiceId = String(body?.voice_id ?? "").trim();
      if (!voiceId) return json({ error: "voice_id_required" }, 400);
      if (!/^[A-Za-z0-9_-]{10,64}$/.test(voiceId)) {
        return json({ error: "invalid_voice_id_format" }, 400);
      }

      let previewUrl: string | null = null;
      if (apiKey) {
        try {
          const r = await fetch(
            `https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`,
            { headers: { "xi-api-key": apiKey } },
          );
          if (r.ok) {
            const meta = await r.json();
            previewUrl = meta?.preview_url ?? null;
          }
        } catch { /* non-fatal — still save the voice id */ }
      }

      const { data: row, error: insErr } = await supabase
        .from("cloned_voices")
        .upsert(
          {
            user_id: user.id,
            name,
            voice_id: voiceId,
            source: "voice_id",
            preview_url: meta?.preview_url ?? null,
          },
          { onConflict: "user_id,voice_id" },
        )
        .select("*").single();
      if (insErr) return json({ error: "db_insert_failed", detail: insErr.message }, 500);
      return json({ voice: row });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: "unexpected", detail: String(e?.message ?? e) }, 500);
  }
});

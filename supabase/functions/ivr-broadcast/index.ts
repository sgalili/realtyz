// IVR mass-broadcast — TTS via ElevenLabs Multilingual v3 (Hebrew),
// uploads to public `ivr-audio` bucket, then dials each lead via Twilio
// using inline TwiML <Play>. Honors per-broker Twilio creds stored in
// user_api_keys.api_key as "SID:TOKEN:NUMBER".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { encode as b64encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { decode as b64decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normE164(raw: string): string {
  const t = (raw || "").trim();
  const d = t.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("972")) return "+" + d;
  if (d.startsWith("0")) return "+972" + d.slice(1);
  if (d.length === 9) return "+972" + d;
  return t.startsWith("+") ? t : "+" + d;
}

async function resolveElevenLabsKey(
  admin: ReturnType<typeof createClient>,
  userId?: string | null,
): Promise<string | null> {
  // 1. Environment - try every common naming variation
  for (const k of ["ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY", "ELEVENLABS_KEY", "XI_API_KEY"]) {
    const v = Deno.env.get(k);
    if (v && v.trim()) return v.trim();
  }
  // 2. Per-user creds (user_api_keys) — broker-specific override
  if (userId) {
    const { data: uRows } = await admin
      .from("user_api_keys")
      .select("service_name, api_key")
      .eq("user_id", userId);
    const uRow = (uRows ?? []).find((r: any) =>
      r.api_key && /eleven/i.test(String(r.service_name ?? ""))
    );
    if (uRow?.api_key) return String(uRow.api_key).trim();
  }
  // 3. Global api_configs row
  const { data } = await admin
    .from("api_configs")
    .select("service_name, api_key, is_active")
    .ilike("service_name", "%eleven%");
  const row = (data ?? []).find((r: any) => r.api_key && String(r.api_key).trim().length > 0);
  return row?.api_key?.trim() ?? null;
}

async function generateTts(text: string, voiceId: string, apiKey: string): Promise<Uint8Array> {
  // HARD LOCK: ElevenLabs verified production multilingual model for ALL IVR
  // audio (including cloned voices like Udi Vitman). `eleven_multilingual_v3`
  // does NOT exist on the ElevenLabs API and returns 400 model_not_found, so
  // we pin to the stable `eleven_multilingual_v2` model. Never downgrade to
  // v1 or browser TTS.
  const MODEL_ID = "eleven_multilingual_v2";
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.9,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!r.ok) {
    const t = await r.text();
    // No silent fallback — surface the failure so we never ship low-fidelity audio.
    throw new Error(`elevenlabs_${MODEL_ID}_failed_${r.status}: ${t}`);
  }
  return new Uint8Array(await r.arrayBuffer());
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authz = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authz } } });
    const admin = createClient(url, service);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthenticated" }, 401);

    const body = await req.json();
    const source = body.source as "recording" | "tts" | "upload";
    const generateOnly = body.generate_only === true;
    const leads = (body.leads ?? []) as Array<{ id?: string; phone: string }>;
    if (!generateOnly && !leads.length) return json({ error: "no_leads" }, 400);

    // 1. Resolve audio URL (upload bytes, or generate via TTS)
    let audioUrl: string | null = body.audio_url ?? null;
    if (!audioUrl) {
      let bytes: Uint8Array | null = null;
      let ext = "mp3";
      if (source === "tts") {
        const text = String(body.text ?? "").trim();
        const voiceId = String(body.voice_id ?? "EXAVITQu4vr4xnSDxMaL");
        if (!text) return json({ error: "missing_text" }, 400);
        const elevenKey = await resolveElevenLabsKey(admin, user.id);
        if (!elevenKey) return json({ error: "missing_elevenlabs_api_key" }, 500);
        bytes = await generateTts(text, voiceId, elevenKey);
      } else if (body.audio_b64) {
        bytes = b64decode(body.audio_b64);
        ext = (body.ext as string) || (source === "recording" ? "webm" : "mp3");
      } else {
        return json({ error: "missing_audio" }, 400);
      }
      const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const contentType = ext === "mp3" ? "audio/mpeg" : ext === "wav" ? "audio/wav" : ext === "m4a" ? "audio/mp4" : "audio/webm";
      const bucket = "ivr-audio";
      let upErr = (await admin.storage.from(bucket).upload(path, bytes, { contentType, upsert: false })).error;
      if (upErr && /not.?found|does not exist/i.test(upErr.message || "")) {
        // Auto-heal: bucket missing, create on the fly then retry once
        try { await admin.storage.createBucket(bucket, { public: false }); } catch (_) { /* ignore */ }
        upErr = (await admin.storage.from(bucket).upload(path, bytes, { contentType, upsert: false })).error;
      }
      if (upErr) return json({ error: "upload_failed", detail: upErr.message }, 500);
      // Use signed URL (long expiry) — bucket is private but Twilio <Play> and <audio> need a fetchable URL
      const SEVEN_DAYS = 60 * 60 * 24 * 7;
      const { data: signed, error: signErr } = await admin.storage.from(bucket).createSignedUrl(path, SEVEN_DAYS);
      if (signErr || !signed?.signedUrl) return json({ error: "sign_failed", detail: signErr?.message }, 500);
      audioUrl = signed.signedUrl;
    }

    // Generate-only mode: return the audio URL without dialing.
    if (generateOnly) {
      return json({ ok: 0, failed: 0, total: 0, audio_url: audioUrl });
    }



    // 2. Load Twilio creds for this broker
    const { data: rows } = await admin
      .from("user_api_keys")
      .select("service_name, api_key")
      .eq("user_id", user.id);
    const twRow = (rows ?? []).find((r: any) => r.service_name === "Twilio");
    const [twSid, twToken, twNumber] = String(twRow?.api_key ?? "").split(":");
    if (!twSid || !twToken || !twNumber) {
      return json({ error: "twilio_not_configured", audio_url: audioUrl }, 400);
    }

    // 3. Dial each lead with inline TwiML <Play>
    const twiml = `<Response><Play>${audioUrl}</Play></Response>`;
    const auth = "Basic " + b64encode(`${twSid}:${twToken}`);
    let ok = 0, failed = 0;
    const failures: Array<{ phone: string; reason: string }> = [];
    for (const l of leads) {
      const to = normE164(l.phone);
      if (!to) { failed++; continue; }
      try {
        const params = new URLSearchParams({ To: to, From: twNumber, Twiml: twiml });
        const r = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twSid}/Calls.json`,
          { method: "POST", headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" }, body: params },
        );
        if (!r.ok) {
          failed++;
          const tx = await r.text();
          failures.push({ phone: to, reason: `${r.status} ${tx.slice(0, 120)}` });
        } else {
          ok++;
        }
      } catch (e: any) {
        failed++;
        failures.push({ phone: to, reason: String(e?.message ?? e) });
      }
    }

    return json({ ok, failed, total: leads.length, audio_url: audioUrl, failures: failures.slice(0, 5) });
  } catch (e: any) {
    console.error("[ivr-broadcast] fatal", e);
    return json({ error: e?.message ?? "internal_error" }, 500);
  }
});

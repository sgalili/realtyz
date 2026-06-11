// Quick clone: accepts a name + audio file (multipart) and calls ElevenLabs
// /v1/voices/add. Persists the resulting voice_id into public.cloned_voices.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function resolveElevenLabsKey(admin: ReturnType<typeof createClient>): Promise<string | null> {
  const envKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (envKey && envKey.trim()) return envKey.trim();
  const { data } = await admin.from("api_configs").select("service_name, api_key").ilike("service_name", "%eleven%");
  const row = (data ?? []).find((r: any) => r.api_key && String(r.api_key).trim().length > 0);
  return row?.api_key?.trim() ?? null;
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

    const form = await req.formData();
    const name = String(form.get("name") ?? "").trim();
    const gender = (form.get("gender") as string | null) ?? null;
    const file = form.get("file") as File | null;
    if (!name || !file) return json({ error: "missing_name_or_file" }, 400);

    const apiKey = await resolveElevenLabsKey(admin);
    if (!apiKey) return json({ error: "missing_elevenlabs_api_key" }, 500);

    const outForm = new FormData();
    outForm.append("name", name);
    outForm.append("description", "Realtyz quick clone");
    outForm.append("files", file, file.name || "sample.webm");

    const r = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: outForm,
    });
    const txt = await r.text();
    if (!r.ok) return json({ error: "elevenlabs_clone_failed", detail: txt.slice(0, 500) }, 502);
    const parsed = JSON.parse(txt);
    const voiceId = parsed.voice_id;
    if (!voiceId) return json({ error: "no_voice_id_returned" }, 502);

    const { error: insErr } = await admin.from("cloned_voices").upsert({
      user_id: user.id, name, voice_id: voiceId, provider: "elevenlabs",
      source: "upload", voice_gender: gender === "male" || gender === "female" ? gender : null,
    }, { onConflict: "user_id,voice_id" });
    if (insErr) return json({ error: "persist_failed", detail: insErr.message }, 500);

    return json({ voice_id: voiceId, name });
  } catch (e: any) {
    console.error("[elevenlabs-voice-clone] fatal", e);
    return json({ error: e?.message ?? "internal_error" }, 500);
  }
});

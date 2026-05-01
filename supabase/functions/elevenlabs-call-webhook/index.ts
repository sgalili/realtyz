// Receives the post-call webhook from ElevenLabs Conversational AI.
// Persists transcript + summary to call_records, links/creates a lead in the
// Deal Room, and dispatches a high-priority notification when the AI asked
// for a human callback.
//
// Public endpoint (verify_jwt = false). Validates HMAC signature when
// ELEVENLABS_WEBHOOK_SECRET is configured.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, elevenlabs-signature",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET") || "";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function digitsOnly(s: string) {
  return (s || "").replace(/\D/g, "");
}

async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET) return true; // not enforced if secret not set
  if (!signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return signature.includes(hex);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const raw = await req.text();
    const sigHeader = req.headers.get("elevenlabs-signature");
    if (!(await verifySignature(raw, sigHeader))) return json({ error: "Invalid signature" }, 401);

    const payload = JSON.parse(raw);
    // ElevenLabs post-call shape: { type: "post_call_transcription", data: { conversation_id, agent_id, transcript: [...], analysis: { transcript_summary, ... }, metadata: { ... } } }
    const ev = payload.data || payload;
    const conversationId: string = ev.conversation_id || ev.id;
    const agentId: string = ev.agent_id;
    const transcript = ev.transcript || ev.transcript_with_metadata || [];
    const summary: string = ev.analysis?.transcript_summary || ev.summary || "";
    const durationSeconds = Number(ev.metadata?.call_duration_secs ?? ev.metadata?.duration_secs ?? 0);
    const callerPhone: string = ev.metadata?.phone_call?.external_number
      || ev.metadata?.caller_id
      || ev.metadata?.from_number
      || "";

    // Detect callback flag from tool calls
    let needsCallback = false;
    let callbackReason = "";
    const toolCalls = (transcript || [])
      .flatMap((t: Record<string, unknown>) => (t.tool_calls as Array<Record<string, unknown>> | undefined) || []);
    for (const tc of toolCalls) {
      if (tc?.tool_name === "request_callback" || tc?.name === "request_callback") {
        needsCallback = true;
        const params = (tc.parameters || tc.tool_parameters || {}) as Record<string, string>;
        callbackReason = params.reason || "Caller requested follow-up.";
      }
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve owning user via agent_id
    const { data: voiceCfg } = await admin
      .from("voice_agents").select("user_id").eq("elevenlabs_agent_id", agentId).maybeSingle();
    const userId = voiceCfg?.user_id;
    if (!userId) {
      console.warn("[elevenlabs-call-webhook] no voice_agents row for", agentId);
      return json({ ok: true, skipped: "no user mapping" });
    }

    // Match / create lead by phone
    let leadId: string | null = null;
    if (callerPhone) {
      const normalized = digitsOnly(callerPhone);
      const { data: existing } = await admin
        .from("leads")
        .select("id")
        .eq("user_id", userId)
        .eq("phone_number", normalized)
        .maybeSingle();
      if (existing?.id) {
        leadId = existing.id;
      } else {
        const { data: created } = await admin
          .from("leads")
          .insert({
            user_id: userId,
            phone_number: normalized,
            full_name: `Caller ${normalized.slice(-4)}`,
            source: "ai_voice_call",
            lead_stage: "new",
            last_interaction_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        leadId = created?.id || null;
      }
    }

    // Build transcript text
    const transcriptText = (transcript || [])
      .map((t: Record<string, unknown>) => `[${t.role || t.speaker || "agent"}] ${t.message || t.text || ""}`)
      .join("\n");

    // Persist call record (upsert by conversation id)
    const { data: existingCall } = await admin
      .from("call_records").select("id").eq("elevenlabs_conversation_id", conversationId).maybeSingle();

    const callRow = {
      user_id: userId,
      lead_id: leadId,
      elevenlabs_conversation_id: conversationId,
      caller_phone: callerPhone,
      direction: "inbound",
      handled_by: "ai",
      status: needsCallback ? "escalated" : "completed",
      duration_seconds: durationSeconds,
      transcript,
      transcript_text: transcriptText,
      summary,
      needs_callback: needsCallback,
      callback_reason: callbackReason || null,
      ended_at: new Date().toISOString(),
    };

    if (existingCall?.id) {
      await admin.from("call_records").update(callRow).eq("id", existingCall.id);
    } else {
      await admin.from("call_records").insert(callRow);
    }

    // Append a transcript-summary message to the lead's history so the
    // Deal Room timeline shows the call.
    if (leadId) {
      await admin.from("messages").insert({
        lead_id: leadId,
        direction: "inbound",
        sender_type: "ai",
        platform: "whatsapp", // CHECK constraint requires whatsapp/sms/...
        channel: "voice",
        content: `📞 שיחת AI · ${Math.round(durationSeconds / 60)} דק׳\n${summary || transcriptText.slice(0, 800)}`,
        metadata: { source: "ai_voice_call", conversation_id: conversationId, needs_callback: needsCallback },
      });

      // Move to engaged stage on first call
      await admin.from("leads").update({
        last_interaction_at: new Date().toISOString(),
        lead_stage: needsCallback ? "qualified" : "engaged",
      }).eq("id", leadId);
    }

    // High-priority callback notification
    if (needsCallback && leadId) {
      await fetch(`${SUPABASE_URL}/functions/v1/notify-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
        body: JSON.stringify({
          event_type: "critical_question",
          lead_id: leadId,
          lead_name: callerPhone || "Caller",
          detail: `📞 AI escalated call — ${callbackReason}`,
          override_user_id: userId,
        }),
      }).catch((e) => console.error("notify-agent failed", e));
    }

    return json({ ok: true, lead_id: leadId, needs_callback: needsCallback });
  } catch (e) {
    console.error("[elevenlabs-call-webhook] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});

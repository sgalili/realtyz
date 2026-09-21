// End-of-call report from Vapi.
//
// Writes the real outcome of an automated AI call back onto the call attempt we
// logged when the visitor asked to be called: status, duration, the audio
// recording URL and the transcript. The partner dashboard and the lead payload
// read the recording and transcript from here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ok = (body: unknown = { received: true }) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const backendUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(backendUrl, serviceKey);

    const payload = await req.json().catch(() => ({}));
    const message = payload?.message ?? payload;
    const call = message?.call ?? {};
    const providerCallId = String(call?.id ?? message?.callId ?? "").trim();
    if (!providerCallId) return ok({ received: true, skipped: "no call id" });

    const type = String(message?.type ?? "").trim();
    const endedReason = String(message?.endedReason ?? call?.endedReason ?? "").trim();
    const failed = /error|failed|no-answer|busy|declined|customer-did-not-answer/i.test(endedReason);

    const transcript = message?.artifact?.messages ?? message?.messages ?? null;
    const transcriptText = String(message?.artifact?.transcript ?? message?.transcript ?? "").slice(0, 20000) || null;
    const recordingUrl = String(
      message?.artifact?.recordingUrl ?? message?.recordingUrl ?? message?.artifact?.stereoRecordingUrl ?? "",
    ).trim() || null;
    const summary = String(message?.analysis?.summary ?? message?.summary ?? "").slice(0, 4000) || null;
    const duration = Number(message?.durationSeconds ?? message?.duration ?? 0);

    // Idempotent: the same report can arrive more than once.
    const { data: existing } = await admin
      .from("call_records")
      .select("id, metadata")
      .filter("metadata->>provider_call_id", "eq", providerCallId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!existing) return ok({ received: true, skipped: "unknown call" });

    const patch: Record<string, unknown> = {
      status: type === "end-of-call-report" ? (failed ? "failed" : "completed") : String(call?.status ?? "in_progress"),
      needs_callback: failed,
      callback_reason: failed ? endedReason.slice(0, 200) : null,
      metadata: { ...(existing.metadata ?? {}), ended_reason: endedReason || null, provider_call_id: providerCallId },
    };
    if (recordingUrl) patch.recording_url = recordingUrl;
    if (transcript) patch.transcript = transcript;
    if (transcriptText) patch.transcript_text = transcriptText;
    if (summary) patch.summary = summary;
    if (Number.isFinite(duration) && duration > 0) patch.duration_seconds = Math.round(duration);
    if (type === "end-of-call-report") patch.ended_at = new Date().toISOString();

    await admin.from("call_records").update(patch).eq("id", existing.id);
    return ok();
  } catch (error) {
    console.error("[vapi-call-webhook]", error);
    return ok({ received: true });
  }
});

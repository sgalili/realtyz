// Re-trigger a failed automated AI call from the partner dashboard.
//
// Allowed callers: the workspace owner of the attempt, or the partner (affiliate)
// the attempt was attributed to. Nothing here is ever surfaced to the visitor.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const backendUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const caller = createClient(backendUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: auth } = await caller.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const admin = createClient(backendUrl, serviceKey);
    const attemptId = String((await req.json().catch(() => ({})))?.attempt_id ?? "").trim();
    if (!attemptId) return json({ error: "attempt_id required" }, 400);

    const { data: attempt } = await admin
      .from("call_records")
      .select("id, user_id, lead_id, caller_phone, metadata")
      .eq("id", attemptId)
      .maybeSingle();
    if (!attempt) return json({ error: "not found" }, 404);
    const affiliateId = (attempt.metadata ?? {})?.affiliate_id ?? null;
    if (attempt.user_id !== userId && affiliateId !== userId) return json({ error: "forbidden" }, 403);

    const listingId = (attempt.metadata ?? {})?.listing_id ?? null;
    const response = await fetch(`${backendUrl}/functions/v1/vapi-outbound-call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        phone_number: attempt.caller_phone,
        lead_id: attempt.lead_id,
        listing_id: listingId,
        instructions: "השיחה מתייחסת אך ורק לנכס שנשלח אליך. שאל לפחות שלוש שאלות סינון לפני סיום השיחה.",
        workspace_owner_id: attempt.user_id,
      }),
    });
    const callData = await response.json().catch(() => ({}));
    const success = response.ok && !callData?.error;
    const providerCallId = String(callData?.call?.id ?? "").trim() || null;
    const errorText = success ? null : String(callData?.error ?? `HTTP ${response.status}`).slice(0, 300);

    await admin.from("call_records").insert({
      user_id: attempt.user_id,
      lead_id: attempt.lead_id,
      caller_phone: attempt.caller_phone,
      direction: "outbound",
      status: success ? "queued" : "failed",
      handled_by: "ai",
      needs_callback: !success,
      callback_reason: errorText,
      started_at: new Date().toISOString(),
      metadata: { ...(attempt.metadata ?? {}), provider: "vapi", provider_call_id: providerCallId, error: errorText, retry_of: attempt.id },
    });
    if (success) await admin.from("call_records").update({ needs_callback: false }).eq("id", attempt.id);

    return json({ success, error: errorText });
  } catch (error) {
    console.error("[retry-ai-call]", error);
    return json({ success: false, error: (error as Error).message }, 200);
  }
});

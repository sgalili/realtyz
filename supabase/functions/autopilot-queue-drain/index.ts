// Background worker: claims due autopilot queue jobs, dispatches via send-whatsapp,
// records messages, and updates queue status. Triggered by pg_cron every minute.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH_SIZE = 25;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const workerId = `drain-${crypto.randomUUID().slice(0, 8)}`;

  // Recover stuck jobs first
  await sb.rpc("requeue_stuck_autopilot_jobs");

  // Claim due jobs
  const { data: jobs, error: claimErr } = await sb.rpc("claim_autopilot_jobs", {
    p_limit: BATCH_SIZE,
    p_worker: workerId,
  });

  if (claimErr) {
    console.error("claim error", claimErr);
    return new Response(JSON.stringify({ error: claimErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const list = (jobs ?? []) as any[];
  if (list.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0, failed = 0, retried = 0, paused = 0;

  // Cache per-tenant pause state to avoid one RPC call per job.
  const pauseCache = new Map<string, boolean>();
  async function isPaused(userId: string): Promise<boolean> {
    if (!userId) return false;
    if (pauseCache.has(userId)) return pauseCache.get(userId)!;
    const { data } = await sb.rpc("is_ai_paused", { _user_id: userId });
    const v = Boolean(data);
    pauseCache.set(userId, v);
    return v;
  }

  for (const job of list) {
    try {
      // Hard kill switch — if the broker paused AI, defer the job (don't fail it).
      if (await isPaused(job.user_id)) {
        const nextAt = new Date(Date.now() + 5 * 60_000).toISOString();
        await sb.from("autopilot_queue").update({
          status: "pending",
          scheduled_at: nextAt,
          locked_at: null,
          locked_by: null,
          last_error: "ai_paused_by_owner",
        }).eq("id", job.id);
        paused++;
        continue;
      }

      // Get lead phone
      const { data: lead, error: leadErr } = await sb
        .from("leads")
        .select("id, phone_number, full_name")
        .eq("id", job.lead_id)
        .maybeSingle();

      if (leadErr || !lead?.phone_number) {
        throw new Error(leadErr?.message || "lead missing phone_number");
      }

      // Dispatch via unified gateway
      const dispatchRes = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
          "x-tenant-id": job.user_id,
        },
        body: JSON.stringify({
          phone_number: lead.phone_number,
          message: job.message_content,
          lead_id: job.lead_id,
          template_id: job.template_id ?? undefined,
          tenant_id: job.user_id,
        }),
      });

      const dispatchJson = await dispatchRes.json().catch(() => ({}));

      if (!dispatchRes.ok || dispatchJson.success === false) {
        throw new Error(dispatchJson.error || `gateway ${dispatchRes.status}`);
      }

      // Record outbound message
      const { data: msg } = await sb.from("messages").insert({
        lead_id: job.lead_id,
        direction: "outbound",
        sender_type: "ai",
        platform: "whatsapp",
        channel: "whatsapp",
        content: job.message_content,
        metadata: {
          autopilot_queue_id: job.id,
          campaign_id: job.campaign_id,
          provider: dispatchJson.provider,
          provider_message_id: dispatchJson.message_id,
        },
      }).select("id").maybeSingle();

      await sb.from("autopilot_queue").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        message_id: msg?.id ?? null,
        last_error: null,
      }).eq("id", job.id);

      sent++;
    } catch (e: any) {
      const errMsg = String(e?.message || e);
      const willRetry = job.attempts < job.max_attempts;
      const nextAt = new Date(Date.now() + 60_000 * Math.pow(2, job.attempts)).toISOString();

      await sb.from("autopilot_queue").update({
        status: willRetry ? "pending" : "failed",
        scheduled_at: willRetry ? nextAt : job.scheduled_at,
        locked_at: null,
        locked_by: null,
        last_error: errMsg.slice(0, 500),
      }).eq("id", job.id);

      if (willRetry) retried++; else failed++;
      console.error(`job ${job.id} failed (attempt ${job.attempts}): ${errMsg}`);
    }
  }

  return new Response(JSON.stringify({ processed: list.length, sent, failed, retried, paused }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

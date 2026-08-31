// Lead follow-up drip: gentle re-engagement when a lead goes silent.
//
// Stage 1 — silence of 2h+ (and under 24h so we stay inside the WhatsApp
//           customer-service window): short, warm nudge.
// Stage 2 — silence of 72h+: single check-in, then the lead is left alone.
//
// Messages are ENQUEUED into `autopilot_queue`, never sent directly, so the
// existing drain worker keeps enforcing the kill switch, the per-tenant
// autopilot toggle and retry/back-off.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const HOUR = 3_600_000;
const STAGE1_MIN_H = 2;
const STAGE1_MAX_H = 23; // stay inside the 24h free-form window
const STAGE2_MIN_H = 72;
// Never chase a lead who has been cold for longer than this — prevents a
// historical backlog from turning into a mass blast on first run.
const MAX_IDLE_H = 24 * 14;
// Hard cap on outbound nudges per run.
const MAX_PER_RUN = 25;

/** Local Israel hour — never nudge outside 09:00-21:00. */
function israelHour(d = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      hour12: false,
    }).format(d),
  );
}

const firstName = (n: string | null) => (n || "").trim().split(/\s+/)[0] || "";

const STAGE_TEXT: Record<number, (name: string, city: string | null) => string> = {
  1: (name) =>
    `היי ${name}, רק בודק שהכול ברור מהשיחה שלנו. יש משהו שתרצה שאבדוק בשבילך?`.trim(),
  2: (name, city) =>
    `היי ${name}, עברו כמה ימים ורציתי לעדכן שיש תנועה בשוק${city ? ` ב${city}` : ""}. שווה שנעשה סבב קצר על מה שמתאים לך עכשיו?`.trim(),
};

const DONE_STAGES = new Set(["closed", "won", "lost", "ghosted"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const hour = israelHour();
  if (hour < 9 || hour >= 21) {
    return new Response(JSON.stringify({ skipped: "quiet_hours", hour }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: leads, error } = await sb
    .from("leads")
    .select(
      "id, assigned_to, full_name, phone_number, city, lead_stage, last_interaction_at, drip_stage, drip_last_sent_at",
    )
    .eq("is_demo", false)
    .not("phone_number", "is", null)
    .not("last_interaction_at", "is", null)
    .lt("drip_stage", 2)
    .order("last_interaction_at", { ascending: true })
    .limit(300);

  if (error) {
    console.error("[lead-followup-drip] load failed", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let enqueued = 0;
  const now = Date.now();

  for (const lead of leads ?? []) {
    if (DONE_STAGES.has(String(lead.lead_stage || "").toLowerCase())) continue;
    const owner = lead.assigned_to as string | null;
    if (!owner) continue;

    const idleH = (now - new Date(lead.last_interaction_at as string).getTime()) / HOUR;
    const stage = Number(lead.drip_stage ?? 0);

    let next = 0;
    if (stage === 0 && idleH >= STAGE1_MIN_H && idleH <= STAGE1_MAX_H) next = 1;
    else if (stage <= 1 && idleH >= STAGE2_MIN_H) next = 2;
    if (!next) continue;
    if (idleH > MAX_IDLE_H) continue;

    // Never two drips within 24h of each other.
    if (lead.drip_last_sent_at && now - new Date(lead.drip_last_sent_at as string).getTime() < 24 * HOUR) {
      continue;
    }

    const text = STAGE_TEXT[next](firstName(lead.full_name as string | null), lead.city as string | null);

    const { error: qErr } = await sb.from("autopilot_queue").insert({
      user_id: owner,
      lead_id: lead.id,
      message_content: text,
      // template_id is passed straight to Meta as an approved-template name by
      // the drain worker, so it MUST stay null for free-form drip text.
      // Dedupe lives on leads.drip_stage / drip_last_sent_at instead.
      status: "pending",
      scheduled_at: new Date().toISOString(),
    });
    if (qErr) {
      console.warn("[lead-followup-drip] enqueue failed", lead.id, qErr.message);
      continue;
    }

    await sb
      .from("leads")
      .update({ drip_stage: next, drip_last_sent_at: new Date().toISOString() })
      .eq("id", lead.id);
    enqueued += 1;
    if (enqueued >= MAX_PER_RUN) break;
  }

  return new Response(JSON.stringify({ ok: true, scanned: leads?.length ?? 0, enqueued }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

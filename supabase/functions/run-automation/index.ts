// Run Automation
//
// Executes a single queued automation_run by id.
// Looks up the automation, resolves the lead context, and performs the action:
//   - send_whatsapp   -> calls send-whatsapp gateway with templated message
//   - create_note     -> inserts a knowledge_documents row tagged "Automation Note"
//   - notify_agent    -> calls notify-agent function (WhatsApp to the agent)
//   - composite       -> performs all three when configured
//
// The run row is updated to success/failed with a human-readable summary so the
// Deal Room Activity Feed can render what the bot actually did.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type RunRow = {
  id: string;
  user_id: string;
  automation_id: string | null;
  lead_id: string | null;
  trigger_type: string;
  action_type: string;
  status: string;
  payload: Record<string, unknown>;
};

type AutomationRow = {
  id: string;
  user_id: string;
  name: string;
  trigger_type: string;
  action_type: string;
  action_config: {
    message_template?: string;
    note_title?: string;
    note_body?: string;
    notify_event_type?: "new_high_priority" | "meeting_booked" | "critical_question";
    notify_detail?: string;
    delay_hours?: number;
  };
};

type LeadRow = {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  city: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function renderTemplate(tpl: string, lead: LeadRow | null, payload: Record<string, unknown>): string {
  const ctx: Record<string, string> = {
    "{{name}}": lead?.full_name || (payload.lead_name as string) || "",
    "{{first_name}}": (lead?.full_name?.split(" ")[0]) || "",
    "{{phone}}": lead?.phone_number || "",
    "{{city}}": lead?.city || "",
  };
  let out = tpl;
  for (const [k, v] of Object.entries(ctx)) out = out.replaceAll(k, v);
  return out;
}

async function runOne(supabase: ReturnType<typeof createClient>, runId: string) {
  // Load run + automation + lead atomically
  const { data: run, error: runErr } = await supabase
    .from("automation_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (runErr || !run) return { ok: false, error: "run_not_found" };
  const r = run as RunRow;
  if (r.status !== "pending") return { ok: true, skipped: "not_pending" };

  await supabase
    .from("automation_runs")
    .update({ status: "running", executed_at: new Date().toISOString() })
    .eq("id", r.id);

  let automation: AutomationRow | null = null;
  if (r.automation_id) {
    const { data } = await supabase
      .from("automations")
      .select("*")
      .eq("id", r.automation_id)
      .maybeSingle();
    automation = data as AutomationRow | null;
  }
  if (!automation) {
    await supabase.from("automation_runs").update({
      status: "skipped", error: "automation_missing", summary: "Automation no longer exists",
    }).eq("id", r.id);
    return { ok: false, error: "automation_missing" };
  }

  let lead: LeadRow | null = null;
  if (r.lead_id) {
    const { data } = await supabase
      .from("leads")
      .select("id, full_name, phone_number, city")
      .eq("id", r.lead_id)
      .maybeSingle();
    lead = data as LeadRow | null;
  }

  const summaries: string[] = [];
  const errors: string[] = [];

  const cfg = automation.action_config || {};
  const types =
    automation.action_type === "composite"
      ? ["send_whatsapp", "create_note", "notify_agent"].filter((t) => {
          if (t === "send_whatsapp") return !!cfg.message_template;
          if (t === "create_note") return !!(cfg.note_title || cfg.note_body);
          if (t === "notify_agent") return !!cfg.notify_event_type;
          return false;
        })
      : [automation.action_type];

  for (const t of types) {
    try {
      if (t === "send_whatsapp") {
        if (!lead?.phone_number) throw new Error("lead has no phone");
        const message = renderTemplate(cfg.message_template || "", lead, r.payload);
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
          },
          body: JSON.stringify({
            phone_number: lead.phone_number,
            message,
            lead_id: lead.id,
            override_user_id: r.user_id,
            sender_type: "automation",
          }),
        });
        if (!res.ok) throw new Error(`send-whatsapp ${res.status}`);
        summaries.push(`WhatsApp sent to ${lead.full_name || lead.phone_number}`);
      } else if (t === "create_note") {
        const title = renderTemplate(cfg.note_title || `Automation: ${automation.name}`, lead, r.payload);
        const body = renderTemplate(cfg.note_body || `Triggered by ${automation.trigger_type}`, lead, r.payload);
        const { error } = await supabase.from("knowledge_documents").insert({
          user_id: r.user_id,
          title,
          raw_text: body,
          source_type: "text",
          source_metadata: {
            tag: "Automation Note",
            automation_id: automation.id,
            lead_id: r.lead_id,
            trigger: automation.trigger_type,
          },
        });
        if (error) throw new Error(error.message);
        summaries.push(`Internal note created`);
      } else if (t === "notify_agent") {
        const evt = cfg.notify_event_type || "new_high_priority";
        const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
          },
          body: JSON.stringify({
            event_type: evt,
            lead_id: r.lead_id,
            prospect_name: lead?.full_name || lead?.phone_number || "Prospect",
            detail: renderTemplate(cfg.notify_detail || automation.name, lead, r.payload),
            override_user_id: r.user_id,
          }),
        });
        if (!res.ok) throw new Error(`notify-agent ${res.status}`);
        summaries.push(`Agent notified (${evt})`);
      }
    } catch (e: any) {
      errors.push(`${t}: ${e?.message || String(e)}`);
    }
  }

  const ok = errors.length === 0;
  await supabase
    .from("automation_runs")
    .update({
      status: ok ? "success" : "failed",
      summary: summaries.join(" • ") || `Ran ${automation.name}`,
      error: errors.length ? errors.join(" | ") : null,
      executed_at: new Date().toISOString(),
    })
    .eq("id", r.id);

  if (ok && automation) {
    const { data: cur } = await supabase
      .from("automations")
      .select("run_count")
      .eq("id", automation.id)
      .maybeSingle();
    await supabase
      .from("automations")
      .update({ last_run_at: new Date().toISOString(), run_count: ((cur as any)?.run_count ?? 0) + 1 })
      .eq("id", automation.id);
  }
  return { ok, summary: summaries.join(" • "), errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const runId = body?.run_id as string | undefined;

    if (runId) {
      const result = await runOne(supabase, runId);
      return json(result);
    }

    // Drain mode: process up to 25 pending runs whose scheduled_for has arrived
    const { data: pending } = await supabase
      .from("automation_runs")
      .select("id")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(25);

    const results: any[] = [];
    for (const row of pending || []) {
      results.push(await runOne(supabase, (row as any).id));
    }
    return json({ processed: results.length, results });
  } catch (e: any) {
    console.error("[run-automation] fatal", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});

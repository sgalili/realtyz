// process-activity-queue
// Cron-invoked drip dispatcher for the campaign_activity_queue Time Bank.
//
// BATCH RULES (group posting):
//   • Each tick releases up to BATCH_SIZE (5) pending rows PER WORKSPACE.
//   • After a batch lands, all remaining pending rows for that workspace are
//     pushed forward by BATCH_INTERVAL_MIN (10 minutes), so the queue drains
//     in clean 10-minute waves of 5 groups each.
//   • A SINGLE WhatsApp confirmation is sent to the workspace owner per batch
//     asking them to authorize the NEXT batch of 5 groups (if any remain).
//   • Variation spinner + canonical broker footer enforcement preserved.
//
// Safe to invoke every 1-2 minutes by pg_cron — the per-workspace 10-minute
// scheduled_for window keeps real cadence on rails regardless of tick rate.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { enforceOwnerLaws } from "../_shared/owner-laws.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BATCH_SIZE = 5;            // groups released per workspace per wave
const BATCH_INTERVAL_MIN = 10;   // minutes between waves

function pickVariationIndex(row: any): number {
  const variants: any[] = Array.isArray(row?.variations) ? row.variations : [];
  if (variants.length === 0) return 0;
  const base = (row.attempts ?? 0) % variants.length;
  const jitter = Math.random() < 0.34 ? (base + 1) % variants.length : base;
  return jitter;
}

function applyVariation(row: any): { title: string; body: string } {
  const variants: any[] = Array.isArray(row?.variations) ? row.variations : [];
  const idx = typeof row.variation_index === "number"
    ? Math.max(0, Math.min(variants.length - 1, row.variation_index))
    : pickVariationIndex(row);
  const v = variants[idx] ?? {};
  const title = String(v?.title ?? row?.payload?.title ?? "").trim();
  const body = String(v?.body ?? row?.payload?.body ?? row?.payload?.text ?? "").trim();
  return { title, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const now = new Date().toISOString();
  const { data: due, error } = await admin
    .from("campaign_activity_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(200);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Per-workspace batch counters so each workspace gets at most BATCH_SIZE
  // rows released in this tick.
  const perWsCount = new Map<string, number>();
  const touchedWorkspaces = new Set<string>();
  const results: any[] = [];

  for (const row of due ?? []) {
    const ws = row.workspace_owner_id as string;
    const used = perWsCount.get(ws) ?? 0;
    if (used >= BATCH_SIZE) continue;

    const { data: locked, error: lockErr } = await admin
      .from("campaign_activity_queue")
      .update({ status: "processing", processed_at: now, attempts: (row.attempts ?? 0) + 1 })
      .eq("id", row.id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (lockErr || !locked) continue;

    try {
      const { title, body } = applyVariation(locked);
      const merged = [title, body].filter(Boolean).join("\n\n");
      const compliant = enforceOwnerLaws(merged, { withLicense: true });

      const newPayload = {
        ...(locked.payload ?? {}),
        outbound_text: compliant,
        chosen_title: title,
        chosen_body: body,
      };

      const isManual =
        locked.activity_type === "manual_share" ||
        locked.activity_type === "fb_group_post";
      const nextStatus = isManual ? "ready" : "completed";
      const nextPublication = isManual
        ? "ready_awaiting_whatsapp_auth"
        : "published";

      await admin
        .from("campaign_activity_queue")
        .update({
          status: nextStatus,
          publication_status: nextPublication,
          payload: newPayload,
          variation_index:
            typeof locked.variation_index === "number"
              ? locked.variation_index
              : pickVariationIndex(locked),
          completed_at: nextStatus === "completed" ? now : null,
        })
        .eq("id", locked.id);

      perWsCount.set(ws, used + 1);
      touchedWorkspaces.add(ws);
      results.push({ id: locked.id, status: nextStatus, workspace: ws });
    } catch (e: any) {
      await admin
        .from("campaign_activity_queue")
        .update({ status: "failed", last_error: String(e?.message ?? e) })
        .eq("id", locked.id);
      results.push({ id: locked.id, status: "failed", error: String(e?.message ?? e) });
    }
  }

  // Per-workspace post-batch housekeeping:
  //   1. Push every remaining pending row forward by BATCH_INTERVAL_MIN.
  //   2. Send ONE WhatsApp confirmation asking the owner to authorize the
  //      next 5-group wave (if any remain).
  for (const ws of touchedWorkspaces) {
    const releasedThisTick = perWsCount.get(ws) ?? 0;
    const nextWaveAt = new Date(Date.now() + BATCH_INTERVAL_MIN * 60_000).toISOString();

    await admin
      .from("campaign_activity_queue")
      .update({ scheduled_for: nextWaveAt })
      .eq("workspace_owner_id", ws)
      .eq("status", "pending")
      .lt("scheduled_for", nextWaveAt);

    const { count: remaining } = await admin
      .from("campaign_activity_queue")
      .select("id", { count: "exact", head: true })
      .eq("workspace_owner_id", ws)
      .eq("status", "pending");

    try {
      const { data: ownerProfile } = await admin
        .from("profiles")
        .select("phone, full_name")
        .eq("id", ws)
        .maybeSingle();
      const ownerPhone = String(ownerProfile?.phone ?? "").trim();
      if (!ownerPhone) continue;

      const appUrl =
        Deno.env.get("APP_URL")?.replace(/\/+$/, "") ||
        "https://realtyz.udiman.com";
      const queueUrl = `${appUrl}/campaigns?tab=create&view=queue`;
      const nextCount = Math.min(BATCH_SIZE, remaining ?? 0);

      const message = nextCount > 0
        ? `📢 ${releasedThisTick} פוסטים בקבוצות מוכנים כעת לפרסום.\n\n` +
          `נותרו ${remaining} קבוצות בתור — לאשר פרסום של ${nextCount} הבאות בעוד ${BATCH_INTERVAL_MIN} דקות?\n\n` +
          `כניסה לתור: ${queueUrl}`
        : `📢 ${releasedThisTick} פוסטים בקבוצות מוכנים כעת לפרסום.\n\n` +
          `אין יותר קבוצות בתור.\n\nכניסה לתור: ${queueUrl}`;

      await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
        body: JSON.stringify({
          phone_number: ownerPhone,
          message,
          tenant_id: ws,
        }),
      });
    } catch (notifyErr) {
      console.error("owner WhatsApp batch notify failed:", notifyErr);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      drained: results.length,
      workspaces: touchedWorkspaces.size,
      batch_size: BATCH_SIZE,
      batch_interval_min: BATCH_INTERVAL_MIN,
      results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

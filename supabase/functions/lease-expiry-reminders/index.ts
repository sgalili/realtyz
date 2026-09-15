/**
 * lease-expiry-reminders
 * ─────────────────────
 * Daily job. Finds contacts whose lease ends in exactly 60 days and has Rita
 * ask, on WhatsApp, whether they want help finding a new rental.
 */
import { corsHeaders, dispatchOnce, firstName, israelToday, addDaysIso, json, runJob } from "../_shared/engagementJobs.ts";

const JOB = "lease-expiry-reminders";
const BATCH = 50;
const DAYS_AHEAD = 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  return await runJob(JOB, 240, async (admin) => {
    const today = israelToday();
    const target = addDaysIso(today.iso, DAYS_AHEAD);

    const { data: leads, error } = await admin
      .from("leads")
      .select("id, full_name, phone_number, city, workspace_owner_id, wa_opt_out, lease_end_date")
      .eq("lease_end_date", target)
      .not("phone_number", "is", null)
      .limit(BATCH);
    if (error) throw new Error(error.message);

    const results: Array<Record<string, unknown>> = [];
    let lastError: string | null = null;

    for (const lead of (leads ?? []) as Array<Record<string, any>>) {
      if (lead.wa_opt_out === true) {
        results.push({ id: lead.id, skipped: "wa_opt_out" });
        continue;
      }

      const name = firstName(lead.full_name);
      const message =
        `שלום ${name}, זו ריטה מהמשרד 🙂\n` +
        `שמנו לב שחוזה השכירות שלך מסתיים בעוד כ-60 יום (${lead.lease_end_date}).\n` +
        `רוצה שנתחיל לחפש בשבילך דירה חדשה להשכרה${lead.city ? ` ב${lead.city}` : ""}, או שיש משהו אחר שנוכל לעזור בו?\n` +
        `אפשר להשיב כאן ואטפל בזה.`;

      const outcome = await dispatchOnce(admin, JOB, {
        dedupeKey: `${lead.id}:${lead.lease_end_date}`,
        leadId: lead.id,
        workspaceOwnerId: lead.workspace_owner_id,
        phone: lead.phone_number,
        tenantId: lead.workspace_owner_id ? String(lead.workspace_owner_id) : null,
        message,
        logAction: "lease_expiry_reminder_sent",
        logMetadata: { lease_end_date: lead.lease_end_date },
      });

      results.push({ id: lead.id, outcome: outcome.kind });
      if (outcome.kind === "failed" || outcome.kind === "halt") lastError = outcome.error;
      if (outcome.kind === "halt") break;
    }

    return { target_date: target, checked: (leads ?? []).length, results, lastError };
  });
});

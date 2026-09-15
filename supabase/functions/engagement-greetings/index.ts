/**
 * engagement-greetings
 * ────────────────────
 * Daily job. Sends Rita's WhatsApp birthday wish to contacts whose birthday is
 * today, and dispatches festive greetings when today matches an active row in
 * holiday_greetings.
 */
import { corsHeaders, dispatchOnce, firstName, israelToday, runJob } from "../_shared/engagementJobs.ts";

const JOB = "engagement-greetings";
const BIRTHDAY_BATCH = 100;
const HOLIDAY_BATCH = 300;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  return await runJob(JOB, 300, async (admin) => {
    const today = israelToday();
    const mmdd = `${String(today.m).padStart(2, "0")}-${String(today.d).padStart(2, "0")}`;
    let lastError: string | null = null;
    let halted = false;

    // ── Birthdays ────────────────────────────────────────────────
    const birthdayResults: Array<Record<string, unknown>> = [];
    const { data: bLeads, error: bErr } = await admin
      .from("leads")
      .select("id, full_name, phone_number, workspace_owner_id, wa_opt_out, birth_date")
      .not("birth_date", "is", null)
      .not("phone_number", "is", null)
      .limit(1000);
    if (bErr) throw new Error(bErr.message);

    const birthdayLeads = ((bLeads ?? []) as Array<Record<string, any>>)
      .filter((l) => String(l.birth_date).slice(5, 10) === mmdd && l.wa_opt_out !== true)
      .slice(0, BIRTHDAY_BATCH);

    for (const lead of birthdayLeads) {
      const name = firstName(lead.full_name);
      const message =
        `${name}, יום הולדת שמח! 🎉\n` +
        `זו ריטה מהמשרד — מאחלים לך שנה נהדרת, בריאות והרבה שמחה.\n` +
        `נשמח תמיד לעזור בכל מה שקשור לנדל"ן.`;

      const outcome = await dispatchOnce(admin, JOB, {
        dedupeKey: `${lead.id}:birthday:${today.y}`,
        leadId: lead.id,
        workspaceOwnerId: lead.workspace_owner_id,
        phone: lead.phone_number,
        tenantId: lead.workspace_owner_id ? String(lead.workspace_owner_id) : null,
        message,
        logAction: "birthday_greeting_sent",
      });
      birthdayResults.push({ id: lead.id, outcome: outcome.kind });
      if (outcome.kind === "failed" || outcome.kind === "halt") lastError = outcome.error;
      if (outcome.kind === "halt") { halted = true; break; }
    }

    // ── Holidays ─────────────────────────────────────────────────
    const holidayResults: Array<Record<string, unknown>> = [];
    let holidays: Array<Record<string, any>> = [];
    if (!halted) {
      const { data: hol, error: hErr } = await admin
        .from("holiday_greetings")
        .select("id, holiday_name, greeting_date, message_template")
        .eq("greeting_date", today.iso)
        .eq("is_active", true);
      if (hErr) throw new Error(hErr.message);
      holidays = (hol ?? []) as Array<Record<string, any>>;
    }

    for (const holiday of holidays) {
      const { data: leads, error } = await admin
        .from("leads")
        .select("id, full_name, phone_number, workspace_owner_id, wa_opt_out")
        .not("phone_number", "is", null)
        .limit(HOLIDAY_BATCH);
      if (error) throw new Error(error.message);

      for (const lead of (leads ?? []) as Array<Record<string, any>>) {
        if (lead.wa_opt_out === true) continue;
        const name = firstName(lead.full_name);
        const message = String(holiday.message_template)
          .replaceAll("{{name}}", name)
          .replaceAll("{{holiday}}", holiday.holiday_name);

        const outcome = await dispatchOnce(admin, JOB, {
          dedupeKey: `${lead.id}:holiday:${holiday.id}`,
          leadId: lead.id,
          workspaceOwnerId: lead.workspace_owner_id,
          phone: lead.phone_number,
          tenantId: lead.workspace_owner_id ? String(lead.workspace_owner_id) : null,
          message,
          logAction: "holiday_greeting_sent",
          logMetadata: { holiday: holiday.holiday_name },
        });
        holidayResults.push({ id: lead.id, holiday: holiday.holiday_name, outcome: outcome.kind });
        if (outcome.kind === "failed" || outcome.kind === "halt") lastError = outcome.error;
        if (outcome.kind === "halt") { halted = true; break; }
      }
      if (halted) break;
    }

    return {
      date: today.iso,
      birthdays: birthdayResults,
      holidays: holidayResults,
      lastError,
    };
  });
});

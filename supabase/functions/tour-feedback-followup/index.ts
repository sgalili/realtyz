/**
 * tour-feedback-followup
 * ──────────────────────
 * Hourly job. Finds tours that finished about 3 hours ago and has Rita ask the
 * client on WhatsApp how it went.
 */
import { corsHeaders, dispatchOnce, firstName, runJob } from "../_shared/engagementJobs.ts";

const JOB = "tour-feedback-followup";
const BATCH = 50;
/** Tour started between 3 and 4 hours ago (hourly runs cover every tour once). */
const MIN_AGE_MIN = 180;
const MAX_AGE_MIN = 240;
const SKIP_STATUS = ["cancelled", "canceled", "archived"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  return await runJob(JOB, 240, async (admin) => {
    const now = Date.now();
    const from = new Date(now - MAX_AGE_MIN * 60_000).toISOString();
    const to = new Date(now - MIN_AGE_MIN * 60_000).toISOString();

    const { data: tours, error } = await admin
      .from("property_tours")
      .select("id, owner_id, client_name, client_phone, property_title, property_address, scheduled_at, status")
      .eq("feedback_sent", false)
      .gte("scheduled_at", from)
      .lte("scheduled_at", to)
      .not("client_phone", "is", null)
      .order("scheduled_at", { ascending: true })
      .limit(BATCH);
    if (error) throw new Error(error.message);

    const results: Array<Record<string, unknown>> = [];
    let lastError: string | null = null;

    for (const tour of (tours ?? []) as Array<Record<string, any>>) {
      const status = String(tour.status ?? "").toLowerCase();
      if (SKIP_STATUS.includes(status)) {
        await admin.from("property_tours")
          .update({ feedback_sent: true, feedback_sent_at: new Date().toISOString() })
          .eq("id", tour.id);
        results.push({ id: tour.id, skipped: `status_${status}` });
        continue;
      }

      const where = String(tour.property_title ?? tour.property_address ?? "הנכס");
      const name = firstName(tour.client_name);
      const message =
        `שלום ${name}, זו ריטה מהמשרד 🙂\n` +
        `איך היה הסיור ב${where}?\n` +
        `נשמח לשמוע מה חשבת — מה אהבת, מה פחות, והאם נמשיך לחפש משהו אחר.\n` +
        `אפשר להשיב כאן בכמה מילים.`;

      const outcome = await dispatchOnce(admin, JOB, {
        dedupeKey: `${tour.id}`,
        workspaceOwnerId: tour.owner_id,
        phone: tour.client_phone,
        tenantId: tour.owner_id ? String(tour.owner_id) : null,
        message,
        logAction: "tour_feedback_request_sent",
        logMetadata: { tour_id: tour.id },
      });

      if (outcome.kind === "sent" || outcome.kind === "duplicate") {
        await admin.from("property_tours")
          .update({ feedback_sent: true, feedback_sent_at: new Date().toISOString() })
          .eq("id", tour.id);
      }
      results.push({ id: tour.id, outcome: outcome.kind });
      if (outcome.kind === "failed" || outcome.kind === "halt") lastError = outcome.error;
      if (outcome.kind === "halt") break;
    }

    return { checked: (tours ?? []).length, results, lastError };
  });
});

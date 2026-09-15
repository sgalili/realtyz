/**
 * tour-reminders
 * ──────────────
 * Runs every 5 minutes from pg_cron. Finds tours that start in ~60 minutes,
 * that were booked more than 24 hours before their start time, and whose
 * reminder was not sent yet — then sends the client a Rita WhatsApp message
 * with the tour details plus a Waze navigation link, and flags the row.
 *
 * Safety rails: bounded batch, DB single-flight lease, idempotent per-row
 * marking, and a paused state on billing/policy failures.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const JOB = "tour-reminders";
const BATCH = 25;
/** Reminder fires when the tour starts inside this window from now. */
const WINDOW_MIN = 55;
const WINDOW_MAX = 65;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function formatSlot(iso: string): string {
  const d = new Date(iso);
  const o: Intl.DateTimeFormatOptions = { timeZone: "Asia/Jerusalem" };
  return `${d.toLocaleDateString("he-IL", { ...o, day: "2-digit", month: "2-digit" })} ` +
    `בשעה ${d.toLocaleTimeString("he-IL", { ...o, hour: "2-digit", minute: "2-digit" })}`;
}

function wazeLink(address: string): string {
  return `https://www.waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

async function sendWhatsApp(payload: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, body: text };
  return { ok: true, status: res.status, body: text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Paused-state guard + single-flight lease in one call.
  const { data: locked, error: lockErr } = await admin.rpc("acquire_scheduler_lock", {
    _job: JOB,
    _lease_seconds: 240,
    _worker: crypto.randomUUID(),
  });
  if (lockErr) {
    console.error("[tour-reminders] lock error", lockErr.message);
    return json({ ok: false, error: lockErr.message }, 500);
  }
  if (!locked) return json({ ok: true, skipped: "locked_or_paused" });

  const results: Array<Record<string, unknown>> = [];
  let lastError: string | null = null;

  try {
    const now = Date.now();
    const from = new Date(now + WINDOW_MIN * 60_000).toISOString();
    const to = new Date(now + WINDOW_MAX * 60_000).toISOString();

    const { data: tours, error } = await admin
      .from("property_tours")
      .select("id, owner_id, client_name, client_phone, property_title, property_address, scheduled_at, created_at, status")
      .eq("reminder_sent", false)
      .gte("scheduled_at", from)
      .lte("scheduled_at", to)
      .not("client_phone", "is", null)
      .order("scheduled_at", { ascending: true })
      .limit(BATCH);
    if (error) throw new Error(error.message);

    for (const t of (tours ?? []) as Array<Record<string, any>>) {
      const status = String(t.status ?? "").toLowerCase();
      if (["cancelled", "canceled", "archived", "done", "completed"].includes(status)) {
        await admin.from("property_tours")
          .update({ reminder_sent: true, reminder_sent_at: new Date().toISOString() })
          .eq("id", t.id);
        results.push({ id: t.id, skipped: `status_${status}` });
        continue;
      }

      // Only tours booked at least 24 hours ahead of their start time.
      const leadMs = new Date(t.scheduled_at).getTime() - new Date(t.created_at).getTime();
      if (leadMs < 24 * 60 * 60_000) {
        results.push({ id: t.id, skipped: "booked_less_than_24h_ahead" });
        continue;
      }

      const address = String(t.property_address ?? t.property_title ?? "").trim();
      const where = String(t.property_title ?? t.property_address ?? "הנכס");
      const when = formatSlot(t.scheduled_at);

      // Rita's voice — details plus one-tap navigation.
      const message =
        `שלום ${t.client_name || ""}, זו ריטה מהמשרד 🙂\n` +
        `תזכורת: הסיור ב${where} מתחיל בעוד שעה, ${when}.\n` +
        (address ? `כתובת: ${address}\nניווט ב-Waze: ${wazeLink(address)}\n` : "") +
        `נתראה! אם משהו משתנה אפשר להשיב כאן.`;

      const sent = await sendWhatsApp({
        phone_number: t.client_phone,
        message,
        tenant_id: String(t.owner_id),
      });

      if (!sent.ok) {
        lastError = `tour ${t.id}: ${sent.status} ${sent.body}`;
        console.error("[tour-reminders] send failed", lastError);
        results.push({ id: t.id, sent: false, status: sent.status });
        // Billing/policy blocks stop the whole job until the owner acts.
        if (sent.status === 402 || sent.status === 403) {
          await admin.from("scheduler_locks")
            .update({ paused: true, last_error: lastError, updated_at: new Date().toISOString() })
            .eq("job_name", JOB);
          break;
        }
        continue;
      }

      // Mark in the same step so a re-run never double-sends.
      await admin.from("property_tours")
        .update({ reminder_sent: true, reminder_sent_at: new Date().toISOString() })
        .eq("id", t.id);

      await admin.from("interaction_activity_log").insert({
        user_id: t.owner_id,
        action_type: "tour_reminder_sent",
        platform: "whatsapp",
        content: message,
        actor_type: "ai",
        actor_label: "Rita",
        metadata: { tour_id: t.id, waze: address ? wazeLink(address) : null },
      });

      results.push({ id: t.id, sent: true });
    }

    return json({ ok: true, checked: (tours ?? []).length, results });
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    console.error("[tour-reminders]", lastError);
    return json({ ok: false, error: lastError }, 500);
  } finally {
    await admin.rpc("release_scheduler_lock", { _job: JOB, _error: lastError });
  }
});

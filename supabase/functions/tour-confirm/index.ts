/**
 * tour-confirm  (public — no JWT)
 * ──────────────────────────────
 * The client opens the WhatsApp link and approves the proposed tour time.
 *  • GET  ?token=…            → the tour details for the public page.
 *  • POST { token, decline? } → marks the tour confirmed (or declined).
 * On approval the tour becomes "confirmed", which makes the database trigger
 * write the event to the broker's Google Calendar, and the broker gets an
 * instant WhatsApp alert.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function formatSlot(iso: string | null): string {
  if (!iso) return "מועד שיתואם";
  const d = new Date(iso);
  const o: Intl.DateTimeFormatOptions = { timeZone: "Asia/Jerusalem" };
  return `${d.toLocaleDateString("he-IL", { ...o, weekday: "long" })} ` +
    `${d.toLocaleDateString("he-IL", { ...o, day: "2-digit", month: "2-digit" })} ` +
    `בשעה ${d.toLocaleTimeString("he-IL", { ...o, hour: "2-digit", minute: "2-digit" })}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const bodyJson = req.method === "POST"
      ? ((await req.json().catch(() => ({}))) as { token?: string; decline?: boolean })
      : {};
    const token = String(bodyJson.token ?? url.searchParams.get("token") ?? "").trim();
    if (!token) return json({ ok: false, error: "token is required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: tour } = await admin
      .from("property_tours")
      .select("*")
      .eq("share_token", token)
      .maybeSingle();
    if (!tour) return json({ ok: false, error: "not_found" }, 404);

    const row = tour as Record<string, any>;
    const metadata = (row.metadata ?? {}) as Record<string, any>;
    const where = row.property_title || row.property_address || "הנכס";

    const publicTour = {
      client_name: row.client_name ?? null,
      property_title: row.property_title ?? null,
      property_address: row.property_address ?? null,
      scheduled_at: row.scheduled_at ?? null,
      scheduled_label: formatSlot(row.scheduled_at ?? null),
      status: String(row.status ?? "pending"),
      client_confirmed_at: metadata.client_confirmed_at ?? null,
    };

    if (req.method === "GET") return json({ ok: true, tour: publicTour });

    if (bodyJson.decline) {
      await admin
        .from("property_tours")
        .update({ status: "pending", metadata: { ...metadata, client_declined_at: new Date().toISOString() } })
        .eq("id", row.id);
      return json({ ok: true, declined: true, tour: { ...publicTour, status: "pending" } });
    }

    const nowIso = new Date().toISOString();
    const { error: upErr } = await admin
      .from("property_tours")
      .update({
        status: "confirmed",
        metadata: { ...metadata, client_confirmed_at: nowIso, confirmed_by: "client" },
      })
      .eq("id", row.id);
    if (upErr) return json({ ok: false, error: upErr.message }, 500);

    // Instant WhatsApp alert to the broker.
    try {
      const { data: profile } = await admin.from("profiles").select("phone").eq("id", row.owner_id).maybeSingle();
      const phone = (profile as { phone?: string } | null)?.phone;
      if (phone) {
        await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
          body: JSON.stringify({
            phone_number: phone,
            message:
              `הלקוח אישר את מועד הסיור\n` +
              `${row.client_name || "לקוח"} · ${row.client_phone || "—"}\n` +
              `${where}\n` +
              `מועד סופי: ${formatSlot(row.scheduled_at ?? null)}\n` +
              `האירוע נשמר ביומן Google.`,
            tenant_id: row.owner_id,
          }),
        });
      }
    } catch (e) {
      console.error("[tour-confirm] broker alert failed", e);
    }

    // Write the event to the calendar immediately (the trigger also enqueues it).
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/calendar-autosync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
        body: JSON.stringify({ table: "property_tours", record_id: row.id, notify: false }),
      });
    } catch (e) {
      console.error("[tour-confirm] calendar sync failed", e);
    }

    return json({ ok: true, confirmed: true, tour: { ...publicTour, status: "confirmed", client_confirmed_at: nowIso } });
  } catch (e) {
    console.error("[tour-confirm]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

/**
 * tour-notify
 * ───────────
 * Called right after a tour is scheduled in the app.
 *  • Client  → WhatsApp with the proposed time and a one-tap approval link.
 *  • Broker  → WhatsApp reminder that the tour was scheduled and is awaiting
 *              the client's approval.
 * The tour stays "pending" until the client approves through the link
 * (see tour-confirm), and only then is it written to Google Calendar.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC_SITE = "https://realtyz.co.il";

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

async function sendWhatsApp(payload: Record<string, unknown>) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) console.error("[tour-notify] whatsapp failed", res.status, text);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error("[tour-notify] whatsapp error", e);
    return { ok: false, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as { tour_id?: string };
    if (!body.tour_id) return json({ ok: false, error: "tour_id is required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: tour } = await admin.from("property_tours").select("*").eq("id", body.tour_id).maybeSingle();
    if (!tour) return json({ ok: false, error: "tour not found" }, 404);

    const row = tour as Record<string, any>;
    const ownerId = String(row.owner_id);

    // Every tour needs a token so the client can approve it from WhatsApp.
    let token = row.share_token as string | null;
    if (!token) {
      token = crypto.randomUUID().replace(/-/g, "");
      await admin.from("property_tours").update({ share_token: token }).eq("id", row.id);
    }

    const where = row.property_title || row.property_address || "הנכס";
    const when = formatSlot(row.scheduled_at ?? null);
    const approveUrl = `${PUBLIC_SITE}/tour-confirm/${token}`;

    const clientMsg =
      `שלום ${row.client_name || ""}, קבענו סיור ב${where}.\n` +
      `מועד מוצע: ${when}.\n` +
      `לאישור המועד בלחיצה אחת: ${approveUrl}\n` +
      `אם המועד לא מתאים, אפשר להשיב כאן ונתאם אחר.`;

    const client = row.client_phone
      ? await sendWhatsApp({ phone_number: row.client_phone, message: clientMsg, tenant_id: ownerId })
      : { ok: false, error: "no_client_phone" };

    // Broker reminder — the tour is saved but still waiting for the client.
    const { data: profile } = await admin.from("profiles").select("phone").eq("id", ownerId).maybeSingle();
    const brokerPhone = (profile as { phone?: string } | null)?.phone ?? null;
    const brokerMsg = [
      "📅 נקבע סיור חדש",
      `👤 איש קשר: ${row.client_name || "לא שויך"}`,
      ...(row.client_phone ? [`📞 טלפון: ${row.client_phone}`] : []),
      `🏠 נכס: ${where}`,
      `🕒 מועד: ${when}`,
      "⏳ סטטוס: ממתין לאישור הלקוח. תישלח התראה מיד כשהלקוח יאשר.",
    ].join("\n");
    const broker = brokerPhone
      ? await sendWhatsApp({ phone_number: brokerPhone, message: brokerMsg, tenant_id: ownerId })
      : { ok: false, error: "no_broker_phone" };

    return json({ ok: true, approve_url: approveUrl, client, broker });
  } catch (e) {
    console.error("[tour-notify]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

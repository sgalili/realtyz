/**
 * demo-booking-notify
 * ───────────────────
 * Fired right after a demo booking is submitted from the public landing page.
 *
 *  1. Sends a WhatsApp confirmation to the lead, worded as Rita, with the
 *     scheduled date + time and a request to confirm.
 *  2. Sends a WhatsApp alert to the workspace owner and every manager/admin
 *     with the new lead's name, phone and the requested slot.
 *
 * Public (verify_jwt = false) because the landing form is anonymous. The only
 * accepted input is a demo_requests row id — all content is read server-side.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RITA_WORKSPACE_OWNER_ID = "dc819834-1aa9-4aca-bb27-ec2c8cebde69";
const MANAGER_ROLES = ["owner", "admin", "manager", "managing_broker"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Israeli phone → E.164 digits (9725XXXXXXXX). */
function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  if (digits.startsWith("972")) return digits;
  return digits;
}

/** Hebrew day / date / time of the requested slot, in Israel local time. */
function formatSlot(iso: string | null): string {
  if (!iso) return "מועד שיתואם";
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { timeZone: "Asia/Jerusalem" };
  const day = d.toLocaleDateString("he-IL", { ...opts, weekday: "long" });
  const date = d.toLocaleDateString("he-IL", { ...opts, day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("he-IL", { ...opts, hour: "2-digit", minute: "2-digit" });
  return `${day} ${date} בשעה ${time}`;
}

async function sendWhatsApp(phone: string, message: string, tenantId: string) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({ phone_number: phone, message, tenant_id: tenantId }),
    });
    const payload = await res.json().catch(() => ({}));
    return { phone, ok: res.ok && (payload?.success ?? true), status: res.status };
  } catch (e) {
    return { phone, ok: false, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as { demo_request_id?: string };
    if (!body.demo_request_id) return json({ ok: false, error: "demo_request_id is required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: row, error } = await admin
      .from("demo_requests")
      .select("id, first_name, last_name, phone, preferred_at, workspace_owner_id, source")
      .eq("id", body.demo_request_id)
      .maybeSingle();
    if (error || !row) return json({ ok: false, error: "demo request not found" }, 404);

    const ownerId = (row.workspace_owner_id as string | null) ?? RITA_WORKSPACE_OWNER_ID;
    const leadName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "שלום";
    const slot = formatSlot(row.preferred_at as string | null);
    const leadPhone = normalizePhone(row.phone as string);

    // ── 1. Confirmation to the lead, from Rita ──────────────────────────────
    const leadMessage =
      `היי ${leadName}, זו ריטה, הסוכנת הדיגיטלית של Realtyz.\n` +
      `קיבלתי את הבקשה שלך להדגמה בזום, ורשמתי אותה ל${slot}.\n` +
      `ההדגמה נמשכת כ-15 דקות.\n` +
      `אפשר לאשר לי שהמועד נוח לך? אם צריך מועד אחר, פשוט תכתוב לי מתי ואתאם מחדש.`;

    const results: unknown[] = [];
    if (leadPhone) results.push(await sendWhatsApp(leadPhone, leadMessage, ownerId));

    // ── 2. Alert to the workspace owner + managers ──────────────────────────
    const managerIds = new Set<string>([ownerId]);
    const { data: members } = await admin
      .from("workspace_memberships")
      .select("user_id, role")
      .eq("workspace_owner_id", ownerId);
    (members ?? []).forEach((m: { user_id: string; role: string }) => {
      if (MANAGER_ROLES.includes(String(m.role))) managerIds.add(m.user_id);
    });

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, phone, full_name")
      .in("id", [...managerIds]);

    const managerMessage =
      `ליד חדש מהאתר — בקשת הדגמה בזום\n` +
      `שם: ${leadName}\n` +
      `טלפון: ${row.phone}\n` +
      `מועד מבוקש: ${slot}\n` +
      `מקור: ${row.source ?? "landing"}\n` +
      `ריטה שלחה כבר אישור ללקוח וממתינה לתשובתו.`;

    const managerPhones = new Set<string>();
    (profiles ?? []).forEach((p: { phone: string | null }) => {
      const normalized = normalizePhone(p.phone);
      if (normalized && normalized !== leadPhone) managerPhones.add(normalized);
    });
    for (const phone of managerPhones) {
      results.push(await sendWhatsApp(phone, managerMessage, ownerId));
    }

    console.log("[demo-booking-notify] dispatched", {
      demo_request_id: row.id,
      owner_id: ownerId,
      lead_notified: !!leadPhone,
      managers_notified: managerPhones.size,
    });

    return json({ ok: true, lead_notified: !!leadPhone, managers_notified: managerPhones.size, results });
  } catch (e) {
    console.error("[demo-booking-notify] fatal", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

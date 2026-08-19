// book-property-tour
//
// PUBLIC endpoint (no auth). Called by the shared property landing page
// (/share/property/:token) when a visitor books a viewing.
//
// POST { token, client_name, client_phone, client_email?, date: "YYYY-MM-DD",
//        time: "HH:MM", notes? }
//
// 1. Resolves the share token -> broker (owner_id) + listing snapshot.
// 2. Enforces business hours server-side (Sun-Thu 09:00-18:00, Fri 09:00-13:00,
//    Sat closed) so the rules cannot be bypassed from the client.
// 3. Inserts a property_tours row.
// 4. Fires the approved "Property Viewing Confirmation" WhatsApp template to the
//    client (name, address, date, time + dynamic URL button to the property),
//    falling back to a plain text confirmation when the template is rejected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC_SITE = "https://realtyz.co.il";
const TOUR_TEMPLATE =
  Deno.env.get("WA_TOUR_TEMPLATE_ID") ?? "property_viewing_confirmation";
const TOUR_TEMPLATE_LANG = Deno.env.get("WA_TOUR_TEMPLATE_LANG") ?? "he";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BodySchema = z.object({
  token: z.string().min(6).max(200),
  client_name: z.string().trim().min(2).max(120),
  client_phone: z.string().trim().min(8).max(20),
  client_email: z.string().trim().email().max(255).optional().or(z.literal("")),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().trim().max(1000).optional(),
});

function windowForDay(day: number): { open: number; close: number } | null {
  if (day === 6) return null;
  if (day === 5) return { open: 9 * 60, close: 13 * 60 };
  return { open: 9 * 60, close: 18 * 60 };
}

/** Israel-local wall clock -> absolute ISO timestamp (DST aware). */
function israelWallClockToISO(date: string, time: string): string {
  const naive = Date.parse(`${date}T${time}:00Z`);
  // Probe the Jerusalem offset at roughly that instant.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(naive));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = asUTC - naive;
  return new Date(naive - offsetMs).toISOString();
}

/** Day of week of an Israel-local date string (0=Sunday). */
function israelDayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (/^05\d{8}$/.test(digits)) return `972${digits.slice(1)}`;
  if (/^9725\d{8}$/.test(digits)) return digits;
  if (/^\d{10,15}$/.test(digits)) return digits;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ error: "נתוני הטופס אינם תקינים", details: parsed.error.flatten().fieldErrors }, 400);
    }
    const b = parsed.data;

    const win = windowForDay(israelDayOfWeek(b.date));
    if (!win) return json({ error: "בשבת אין סיורים. יש לבחור יום ראשון עד שישי" }, 400);
    const [h, m] = b.time.split(":").map(Number);
    const mins = h * 60 + m;
    if (mins < win.open || mins > win.close - 30) {
      return json({ error: "השעה מחוץ לשעות הפעילות של המשרד" }, 400);
    }

    const scheduledISO = israelWallClockToISO(b.date, b.time);
    if (new Date(scheduledISO).getTime() < Date.now() - 60_000) {
      return json({ error: "המועד שנבחר כבר עבר" }, 400);
    }

    const phone = normalizePhone(b.client_phone);
    if (!phone) return json({ error: "מספר טלפון לא תקין" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: share } = await admin
      .from("property_shares")
      .select("id, owner_id, listing_id, external_snapshot, expires_at")
      .eq("token", b.token)
      .maybeSingle();
    if (!share) return json({ error: "הקישור לא נמצא" }, 404);
    if (share.expires_at && new Date(share.expires_at as string) < new Date()) {
      return json({ error: "הקישור פג תוקף" }, 410);
    }

    let title: string | null = null;
    let address: string | null = null;
    if (share.listing_id) {
      const { data: l } = await admin
        .from("listings")
        .select("property_title, address, city, neighborhood")
        .eq("id", share.listing_id)
        .maybeSingle();
      if (l) {
        title = (l as any).property_title ?? null;
        address = [(l as any).address, (l as any).neighborhood, (l as any).city].filter(Boolean).join(", ") || null;
      }
    }
    if (!address && share.external_snapshot) {
      const snap = share.external_snapshot as Record<string, unknown>;
      title = title ?? ((snap.property_title ?? snap.title) as string | null) ?? null;
      address = [snap.address, snap.neighborhood, snap.city].filter(Boolean).join(", ") || null;
    }

    const { data: tour, error: insErr } = await admin
      .from("property_tours")
      .insert({
        owner_id: share.owner_id,
        listing_id: share.listing_id,
        share_token: b.token,
        client_name: b.client_name,
        client_phone: phone,
        client_email: b.client_email || null,
        scheduled_at: scheduledISO,
        property_title: title,
        property_address: address,
        notes: b.notes ?? null,
        status: "pending",
      })
      .select("id")
      .single();
    if (insErr) {
      console.error("book-property-tour insert failed", insErr);
      return json({ error: "שמירת הסיור נכשלה, נסו שוב" }, 500);
    }

    // WhatsApp confirmation (best effort — never fails the booking).
    const propertyUrl = `${PUBLIC_SITE}/share/property/${b.token}`;
    const dateHe = `${b.date.slice(8, 10)}/${b.date.slice(5, 7)}/${b.date.slice(0, 4)}`;
    let waOk = false;
    let waError: unknown = null;
    const callWa = async (payload: Record<string, unknown>) => {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
        body: JSON.stringify({ phone_number: phone, tenant_id: share.owner_id, ...payload }),
      });
      const body = await res.json().catch(() => null);
      return { ok: res.ok && (body as any)?.success !== false, body };
    };

    try {
      const templated = await callWa({
        template_id: TOUR_TEMPLATE,
        template_language: TOUR_TEMPLATE_LANG,
        template_components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: b.client_name },
              { type: "text", text: address ?? title ?? "הנכס" },
              { type: "text", text: dateHe },
              { type: "text", text: b.time },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: b.token }],
          },
        ],
      });
      waOk = templated.ok;
      if (!waOk) {
        waError = templated.body;
        const plain = await callWa({
          message:
            `שלום ${b.client_name}, הסיור בנכס ${address ?? title ?? ""} נקבע לתאריך ${dateHe} בשעה ${b.time}.\n` +
            `לצפייה בנכס: ${propertyUrl}`,
        });
        waOk = plain.ok;
        if (!waOk) waError = plain.body;
      }
    } catch (e) {
      waError = e instanceof Error ? e.message : String(e);
    }

    if (waOk) {
      await admin.from("property_tours").update({ whatsapp_sent_at: new Date().toISOString() }).eq("id", tour.id);
    } else {
      console.error("book-property-tour whatsapp failed", waError);
    }

    return json({
      ok: true,
      tour_id: tour.id,
      scheduled_at: scheduledISO,
      whatsapp_sent: waOk,
    });
  } catch (e) {
    console.error("book-property-tour error", e);
    return json({ error: "שגיאה בתיאום הסיור" }, 500);
  }
});

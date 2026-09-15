/**
 * calendar-autosync
 * ─────────────────
 * One entry point that mirrors EVERY dated record in the system to the
 * workspace owner's connected Google Calendar and then notifies the owner and
 * the workspace managers on WhatsApp with the confirmed date, time and item
 * description.
 *
 * Supported tables: meetings, property_tours, scheduled_items, demo_requests.
 * Called by AFTER INSERT/UPDATE database triggers (pg_net) and directly from
 * the app. Idempotent: a row that already carries a Google event id is skipped.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getFreshAccessToken,
  updateCalendarEvent,
} from "../_shared/google-calendar.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MANAGER_ROLES = ["owner", "admin", "manager", "managing_broker"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Kind = "meetings" | "property_tours" | "scheduled_items" | "demo_requests" | "call_records";

const SUPPORTED: Kind[] = ["meetings", "property_tours", "scheduled_items", "demo_requests", "call_records"];

/** Israeli phone → E.164 digits (9725XXXXXXXX). */
function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  if (digits.startsWith("972")) return digits;
  return digits;
}

/** Hebrew day / date / time, Israel local time. */
function formatSlot(iso: string | null): string {
  if (!iso) return "מועד שיתואם";
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { timeZone: "Asia/Jerusalem" };
  return `${d.toLocaleDateString("he-IL", { ...opts, weekday: "long" })} ` +
    `${d.toLocaleDateString("he-IL", { ...opts, day: "2-digit", month: "2-digit" })} ` +
    `בשעה ${d.toLocaleTimeString("he-IL", { ...opts, hour: "2-digit", minute: "2-digit" })}`;
}

async function sendWhatsApp(phone: string, message: string, tenantId: string) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      body: JSON.stringify({ phone_number: phone, message, tenant_id: tenantId }),
    });
    return { phone, ok: res.ok, status: res.status };
  } catch (e) {
    return { phone, ok: false, error: (e as Error).message };
  }
}

type Normalized = {
  ownerId: string | null;
  startISO: string | null;
  endISO: string | null;
  title: string;
  description: string;
  location?: string | null;
  eventIdColumn: string;
  eventLinkColumn: string | null;
  existingEventId: string | null;
  /** Short Hebrew label of the item kind, used in the WhatsApp alert. */
  kindLabel: string;
  /** Related CRM contact, resolved server-side in the active workspace. */
  contactName: string | null;
  /** Related property title/address, when this event has one. */
  propertyLabel: string | null;
  /** Calls are logged after they happen, so past timestamps are still mirrored. */
  allowPast?: boolean;
  /** Automatic logs (calls) never trigger a WhatsApp confirmation. */
  silent?: boolean;
};

const HOUR = 60 * 60_000;

function plusMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function normalize(kind: Kind, row: Record<string, any>): Normalized {
  if (kind === "meetings") {
    const start = row.starts_at ? new Date(row.starts_at).toISOString() : null;
    return {
      ownerId: row.workspace_owner_id ?? row.user_id ?? null,
      startISO: start,
      endISO: row.ends_at ? new Date(row.ends_at).toISOString() : start ? plusMinutes(start, 45) : null,
      title: String(row.title || "פגישה"),
      description: [row.description, row.lead_name && `איש קשר: ${row.lead_name}`, row.lead_phone && `טלפון: ${row.lead_phone}`]
        .filter(Boolean).join("\n"),
      location: row.location ?? null,
      eventIdColumn: "google_calendar_event_id",
      eventLinkColumn: null,
      existingEventId: row.google_calendar_event_id ?? null,
      kindLabel: "פגישה",
      contactName: row.lead_name ?? null,
      propertyLabel: row.property_label ?? row.location ?? null,
    };
  }
  if (kind === "property_tours") {
    const start = row.scheduled_at ? new Date(row.scheduled_at).toISOString() : null;
    return {
      ownerId: row.owner_id ?? null,
      startISO: start,
      endISO: start ? plusMinutes(start, 45) : null,
      title: `סיור בנכס — ${row.property_title || row.property_address || "נכס"}`,
      description: [
        row.property_address && `כתובת: ${row.property_address}`,
        row.client_name && `לקוח: ${row.client_name}`,
        row.client_phone && `טלפון: ${row.client_phone}`,
        row.notes,
      ].filter(Boolean).join("\n"),
      location: row.property_address ?? null,
      eventIdColumn: "google_event_id",
      eventLinkColumn: "google_event_link",
      existingEventId: row.google_event_id ?? null,
      kindLabel: "סיור בנכס",
      contactName: row.client_name ?? null,
      propertyLabel: row.property_title ?? row.property_address ?? null,
    };
  }
  if (kind === "scheduled_items") {
    const start = row.scheduled_for ? new Date(row.scheduled_for).toISOString() : null;
    const typeLabel = row.item_type === "note" ? "הערה"
      : row.item_type === "reminder" ? "תזכורת"
      : row.item_type === "call" ? "שיחה"
      : row.item_type === "task" ? "משימה"
      : "פריט מתוזמן";
    return {
      ownerId: row.workspace_owner_id ?? row.user_id ?? null,
      startISO: start,
      endISO: start ? plusMinutes(start, 30) : null,
      title: `${typeLabel}: ${String(row.title || "").trim() || "ללא כותרת"}`,
      description: String(row.content ?? ""),
      eventIdColumn: "google_event_id",
      eventLinkColumn: "google_event_link",
      existingEventId: row.google_event_id ?? null,
      kindLabel: typeLabel,
      contactName: row.lead_name ?? null,
      propertyLabel: row.property_label ?? null,
    };
  }
  if (kind === "call_records") {
    const start = row.started_at ? new Date(row.started_at).toISOString() : null;
    const end = row.ended_at
      ? new Date(row.ended_at).toISOString()
      : start
      ? plusMinutes(start, Math.max(5, Math.round((Number(row.duration_seconds) || 0) / 60) || 5))
      : null;
    const dirLabel = String(row.direction) === "outbound" ? "שיחה יוצאת" : "שיחה נכנסת";
    const who = row.lead_name || row.caller_phone || "";
    return {
      ownerId: row.workspace_owner_id ?? row.user_id ?? null,
      startISO: start,
      endISO: end,
      title: `${dirLabel}${who ? ` — ${who}` : ""}`,
      description: [
        row.caller_phone && `טלפון: ${row.caller_phone}`,
        `טופל על ידי: ${String(row.handled_by) === "ai" ? "רשמן AI" : "מתווך"}`,
        row.summary && `סיכום: ${row.summary}`,
        row.needs_callback && row.callback_reason && `נדרש חזרה: ${row.callback_reason}`,
        row.recording_url && `הקלטה: ${row.recording_url}`,
      ].filter(Boolean).join("\n"),
      eventIdColumn: "google_event_id",
      eventLinkColumn: "google_event_link",
      existingEventId: row.google_event_id ?? null,
      kindLabel: dirLabel,
      contactName: row.lead_name ?? null,
      propertyLabel: row.property_label ?? null,
      allowPast: true,
      silent: true,
    };
  }
  const start = row.preferred_at ? new Date(row.preferred_at).toISOString() : null;
  const leadName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return {
    ownerId: row.workspace_owner_id ?? null,
    startISO: start,
    endISO: start ? plusMinutes(start, 15) : null,
    title: `הדגמת Realtyz בזום — ${leadName || "ליד חדש"}`,
    description: [leadName && `שם: ${leadName}`, row.phone && `טלפון: ${row.phone}`, row.notes].filter(Boolean).join("\n"),
    eventIdColumn: "google_event_id",
    eventLinkColumn: "google_event_link",
    existingEventId: row.google_event_id ?? null,
    kindLabel: "הדגמה",
    contactName: leadName || null,
    propertyLabel: null,
  };
}

function detailLines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => `📝 ${line}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as { table?: string; record_id?: string; notify?: boolean };
    const kind = String(body.table ?? "") as Kind;
    if (!SUPPORTED.includes(kind) || !body.record_id) {
      return json({ ok: false, error: "table and record_id are required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: row, error } = await admin.from(kind).select("*").eq("id", body.record_id).maybeSingle();
    if (error || !row) return json({ ok: false, error: "record not found" }, 404);

    const raw = row as Record<string, any>;
    // Resolve contact/property details from linked records inside this event's
    // workspace before generating calendar and broker notification text.
    const metadata = (raw.metadata ?? {}) as Record<string, unknown>;
    const eventOwnerId = String(raw.workspace_owner_id ?? raw.owner_id ?? raw.user_id ?? "");
    const leadId = String(raw.lead_id ?? metadata.lead_id ?? "").trim();
    if (leadId && eventOwnerId) {
      const { data: lead } = await admin
        .from("leads")
        .select("full_name")
        .eq("id", leadId)
        .eq("workspace_owner_id", eventOwnerId)
        .maybeSingle();
      raw.lead_name = (lead as { full_name?: string } | null)?.full_name ?? raw.lead_name ?? null;
    }

    const listingId = String(raw.listing_id ?? metadata.listing_id ?? metadata.property_id ?? "").trim();
    if (listingId && eventOwnerId) {
      const { data: listing } = await admin
        .from("listings")
        .select("property_title, address, city")
        .eq("id", listingId)
        .eq("workspace_owner_id", eventOwnerId)
        .maybeSingle();
      if (listing) {
        const listingRow = listing as { property_title?: string; address?: string; city?: string };
        raw.property_label = listingRow.property_title ||
          [listingRow.address, listingRow.city].filter(Boolean).join(", ") || null;
      }
    }

    const item = normalize(kind, raw);
    const rowStatus = String(raw.status ?? "").toLowerCase();
    const isCancelled = ["cancelled", "canceled", "archived"].includes(rowStatus);

    if (!item.ownerId) return json({ ok: true, skipped: "no_schedule_or_owner" });

    let ownerId = item.ownerId;
    let token = await getFreshAccessToken(admin as any, ownerId);
    if ("error" in token) {
      // The record may belong to a team member; fall back to their workspace owner.
      const { data: membership } = await admin
        .from("workspace_memberships")
        .select("workspace_owner_id")
        .eq("user_id", ownerId)
        .neq("workspace_owner_id", ownerId)
        .limit(1)
        .maybeSingle();
      const fallbackOwner = (membership as { workspace_owner_id?: string } | null)?.workspace_owner_id;
      if (fallbackOwner) {
        const retry = await getFreshAccessToken(admin as any, fallbackOwner);
        if (!("error" in retry)) {
          ownerId = fallbackOwner;
          token = retry;
        }
      }
    }
    if ("error" in token) return json({ ok: true, calendar: { created: false, reason: token.error } });

    // ── Cancelled item: drop the calendar event so nothing is orphaned ───────
    if (item.existingEventId && (isCancelled || !item.startISO)) {
      const removed = await deleteCalendarEvent({
        accessToken: token.accessToken,
        calendarId: token.calendarId,
        eventId: item.existingEventId,
      });
      if ("error" in removed) {
        console.error("[calendar-autosync] delete failed", kind, body.record_id, removed.error);
        return json({ ok: false, calendar: { deleted: false, reason: removed.error } }, 502);
      }
      const clear: Record<string, unknown> = { [item.eventIdColumn]: null };
      if (item.eventLinkColumn) clear[item.eventLinkColumn] = null;
      await admin.from(kind).update(clear).eq("id", body.record_id);
      return json({ ok: true, calendar: { deleted: true } });
    }

    if (!item.startISO) return json({ ok: true, skipped: "no_schedule_or_owner" });
    if (isCancelled) return json({ ok: true, skipped: "cancelled" });

    // ── Existing event: patch it in place (time / title / details) ───────────
    if (item.existingEventId) {
      const patched = await updateCalendarEvent({
        accessToken: token.accessToken,
        calendarId: token.calendarId,
        timezone: token.timezone,
        eventId: item.existingEventId,
        summary: item.title,
        description: item.description || "",
        location: item.location ?? undefined,
        startISO: item.startISO,
        endISO: item.endISO ?? plusMinutes(item.startISO, 30),
      });
      if ("error" in patched) {
        console.error("[calendar-autosync] patch failed", kind, body.record_id, patched.error);
        return json({ ok: false, calendar: { updated: false, reason: patched.error } }, 502);
      }
      if (item.eventLinkColumn && patched.htmlLink) {
        await admin.from(kind).update({ [item.eventLinkColumn]: patched.htmlLink }).eq("id", body.record_id);
      }
      return json({
        ok: true,
        calendar: { updated: true, event_id: patched.id, link: patched.htmlLink ?? null },
      });
    }

    // Past items are never pushed to the calendar (call logs are the exception).
    if (!item.allowPast && new Date(item.startISO).getTime() < Date.now() - HOUR) {
      return json({ ok: true, skipped: "past_item" });
    }

    const event = await createCalendarEvent({
      accessToken: token.accessToken,
      calendarId: token.calendarId,
      timezone: token.timezone,
      summary: item.title,
      description: item.description || undefined,
      location: item.location ?? undefined,
      startISO: item.startISO,
      endISO: item.endISO ?? plusMinutes(item.startISO, 30),
    });
    if ("error" in event) {
      console.error("[calendar-autosync] create failed", kind, body.record_id, event.error);
      return json({ ok: false, calendar: { created: false, reason: event.error } }, 502);
    }

    const patch: Record<string, unknown> = { [item.eventIdColumn]: event.id };
    if (item.eventLinkColumn) patch[item.eventLinkColumn] = event.htmlLink ?? null;
    await admin.from(kind).update(patch).eq("id", body.record_id);

    // ── WhatsApp confirmation to the owner + every workspace manager ─────────
    const notifications: unknown[] = [];
    if (body.notify !== false && !item.silent) {
      const recipients = new Set<string>([ownerId]);
      const { data: members } = await admin
        .from("workspace_memberships")
        .select("user_id, role")
        .eq("workspace_owner_id", ownerId);
      (members ?? []).forEach((m: { user_id: string; role: string }) => {
        if (MANAGER_ROLES.includes(String(m.role))) recipients.add(m.user_id);
      });
      const { data: profiles } = await admin.from("profiles").select("id, phone").in("id", [...recipients]);

      const message = [
        `📅 נשמר ביומן Google: ${item.kindLabel}`,
        `👤 איש קשר: ${item.contactName || "לא שויך"}`,
        ...(item.propertyLabel ? [`🏠 נכס: ${item.propertyLabel}`] : []),
        `🗓️ אירוע: ${item.title}`,
        `🕒 מועד: ${formatSlot(item.startISO)}`,
        ...(item.description ? detailLines(item.description) : []),
        ...(event.htmlLink ? [`🔗 פתיחה ביומן: ${event.htmlLink}`] : []),
      ].join("\n");

      const phones = new Set<string>();
      (profiles ?? []).forEach((p: { phone: string | null }) => {
        const normalized = normalizePhone(p.phone);
        if (normalized) phones.add(normalized);
      });
      for (const phone of phones) notifications.push(await sendWhatsApp(phone, message, ownerId));
    }

    return json({
      ok: true,
      calendar: { created: true, event_id: event.id, link: event.htmlLink ?? null },
      notifications,
    });
  } catch (e) {
    console.error("[calendar-autosync]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// Smart Notification dispatcher
//
// Sends a WhatsApp notification to the agent for one of three critical events:
//   - new_high_priority   (a new "Hot Lead" lead was added)
//   - meeting_booked      (a lead confirmed a meeting / moved to Negotiation)
//   - critical_question   (a high-risk question requiring human handling)
//
// Each notification:
//   1. Checks the user's notification_preferences (event toggle + quiet hours).
//   2. Persists a row in `notifications` with a deep link to the Deal Room card.
//   3. Sends WhatsApp to the agent via the existing send-whatsapp gateway.
//
// Callable from the UI (user JWT) or server-to-server with the service role key
// + `override_user_id`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

import { channelsForEvent, withinQuietHours, allowsNotificationOverride } from "../_shared/notificationPreferences.ts";
import { sendSms019 } from "../_shared/sms019.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_PUBLIC_URL") || "https://realtyz.co.il";

type EventType = "new_high_priority" | "meeting_booked" | "critical_question";

type Payload = {
  event_type: EventType;
  lead_id?: string | null;
  lead_name?: string | null;
  detail?: string | null;          // freeform context (e.g., the question text, meeting time)
  override_user_id?: string;       // for server-to-server calls
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isWithinQuietHours(start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const now = new Date();
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
}

const TITLE_BY_EVENT: Record<EventType, string> = {
  new_high_priority: "🔥 New Hot Lead",
  meeting_booked:    "📅 Meeting Booked",
  critical_question: "🚨 Critical Question",
};

const PREF_COLUMN: Record<EventType, string> = {
  new_high_priority: "notify_new_high_priority",
  meeting_booked:    "notify_meeting_booked",
  critical_question: "notify_critical_question",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    const body = (await req.json().catch(() => ({}))) as Payload;

    const allowed: EventType[] = ["new_high_priority", "meeting_booked", "critical_question"];
    if (!body?.event_type || !allowed.includes(body.event_type)) {
      return json({ error: "event_type must be one of " + allowed.join(", ") }, 400);
    }

    if (!allowsNotificationOverride(auth, SERVICE_KEY, body.override_user_id)) return json({ error: "Forbidden recipient override" }, 403);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Resolve user_id
    let userId: string | null = body.override_user_id ?? null;
    if (!userId && auth.startsWith("Bearer ")) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: auth } },
      });
      const { data } = await userClient.auth.getUser();
      userId = data.user?.id ?? null;
    }
    if (!userId) return json({ error: "Unauthorized — could not resolve user" }, 401);

    // Load preferences (auto-create defaults if missing)
    let { data: pref } = await admin
      .from("notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!pref) {
      const { data: created } = await admin
        .from("notification_preferences")
        .insert({ user_id: userId })
        .select()
        .single();
      pref = created;
    }

    const enabled = pref?.[PREF_COLUMN[body.event_type]] !== false;
    if (!enabled) {
      return json({ ok: true, skipped: "event disabled in preferences" });
    }
    const inQuiet = withinQuietHours(pref?.quiet_hours_start, pref?.quiet_hours_end);
    const channels = channelsForEvent(pref ?? {}, body.event_type);

    // Build deep link back to the Deal Room card
    const deepLink = body.lead_id
      ? `${APP_URL}/deal-room?leadId=${body.lead_id}`
      : `${APP_URL}/deal-room`;

    let lead = body.lead_name || "לא שויך";
    let propertyLabel: string | null = null;
    if (body.lead_id) {
      const { data: leadRow } = await admin
        .from("leads")
        .select("full_name, workspace_owner_id")
        .eq("id", body.lead_id)
        .maybeSingle();
      lead = (leadRow as { full_name?: string } | null)?.full_name || lead;

      if (leadRow?.workspace_owner_id && leadRow.workspace_owner_id !== userId) {
        const { data: member } = await admin.from('workspace_memberships').select('user_id').eq('workspace_owner_id', leadRow.workspace_owner_id).eq('user_id', userId).maybeSingle();
        if (!member) return json({ error: 'Lead not accessible to recipient' }, 403);
      }
      const workspaceOwnerId = (leadRow as { workspace_owner_id?: string } | null)?.workspace_owner_id;
      if (workspaceOwnerId) {
        const { data: relation } = await admin
          .from("lead_listings")
          .select("listing_id")
          .eq("lead_id", body.lead_id)
          .limit(1)
          .maybeSingle();
        const listingId = (relation as { listing_id?: string } | null)?.listing_id;
        if (listingId) {
          const { data: listing } = await admin
            .from("listings")
            .select("property_title, address, city")
            .eq("id", listingId)
            .eq("workspace_owner_id", workspaceOwnerId)
            .maybeSingle();
          const property = listing as { property_title?: string; address?: string; city?: string } | null;
          propertyLabel = property?.property_title || [property?.address, property?.city].filter(Boolean).join(", ") || null;
        }
      }
    }
    const title = TITLE_BY_EVENT[body.event_type];
    const text = [
      title,
      `👤 איש קשר: ${lead}`,
      ...(propertyLabel ? [`🏠 נכס: ${propertyLabel}`] : []),
      ...(body.detail ? [`📝 פרטים: ${body.detail.slice(0, 400).replace(/\n+/g, " ")}`] : []),
      `🔗 פתיחה במערכת: ${deepLink}`,
    ].join("\n");

    // Persist notification row first
    const { data: notifRow } = await admin
      .from("notifications")
      .insert({
        user_id: userId,
        lead_id: body.lead_id || null,
        event_type: body.event_type,
        title,
        body: text,
        deep_link: deepLink,
        channel: channels[0] || "in_app",
      })
      .select()
      .single();

    if (!notifRow) throw new Error("Notification persistence failed");
    if (inQuiet) {
      await admin
        .from("notifications")
        .update({ delivered: false, delivery_result: { skipped: "quiet_hours" } })
        .eq("id", notifRow.id);
      return json({ ok: true, notification_id: notifRow?.id, skipped: "quiet_hours" });
    }

    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    const { data: profile } = await admin.from('profiles').select('phone,email').eq('id', userId).maybeSingle();
    const agentPhone = authUser?.user?.phone || profile?.phone || null;
    const agentEmail = authUser?.user?.email || profile?.email || null;
    const results: Record<string, unknown> = {};
    let delivered = false;
    for (const channel of channels) {
      try {
        if (channel === 'sms') {
          if (!agentPhone) { results.sms = { skipped: 'missing_phone' }; continue; }
          const sent = await sendSms019(admin, agentPhone, text, userId);
          results.sms = { accepted: sent.ok, error: sent.error ?? null };
          delivered ||= sent.ok;
        } else if (channel === 'email') {
          if (!agentEmail) { results.email = { skipped: 'missing_email' }; continue; }
          const response = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
            method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateName: 'agent-notification', recipientEmail: agentEmail, idempotencyKey: `agent-notification-${notifRow.id}`, templateData: { title, message: text, deepLink } }),
          });
          const result = await response.json().catch(() => ({}));
          const queued = response.ok && result.success === true && result.queued === true;
          results.email = { queued, reason: result.reason || result.error || null };
          // Queue acceptance is not confirmed delivery.
        } else {
          if (!agentPhone) { results.whatsapp = { skipped: 'missing_phone' }; continue; }
          const response = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
            method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone_number: agentPhone, message: text, tenant_id: userId, force_official: true }),
          });
          const result = await response.json().catch(() => ({}));
          const accepted = response.ok && result.success === true;
          results.whatsapp = { accepted, status: response.status };
          delivered ||= accepted;
        }
      } catch { results[channel] = { error: 'channel_dispatch_failed' }; }
    }
    const deliveryResult = { channels: results, ...(channels.length ? {} : { skipped: 'no_channels_selected' }) };

    await admin
      .from("notifications")
      .update({ delivered, delivery_result: deliveryResult })
      .eq("id", notifRow.id);

    return json({ ok: true, notification_id: notifRow?.id, delivered, deliveryResult });
  } catch (e) {
    console.error("[notify-agent] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});

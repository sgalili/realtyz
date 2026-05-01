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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_PUBLIC_URL") || "https://realtyz.app";

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
    const inQuiet = isWithinQuietHours(pref?.quiet_hours_start, pref?.quiet_hours_end);

    // Build deep link back to the Deal Room card
    const deepLink = body.lead_id
      ? `${APP_URL}/deal-room?leadId=${body.lead_id}`
      : `${APP_URL}/deal-room`;

    const lead = body.lead_name || "Lead";
    const detail = body.detail ? `\n${body.detail.slice(0, 400)}` : "";
    const title = TITLE_BY_EVENT[body.event_type];
    const text =
      `${title}\n` +
      `Lead: ${lead}${detail}\n\n` +
      `Open the Deal Room: ${deepLink}`;

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
        channel: pref?.delivery_channel || "whatsapp",
      })
      .select()
      .single();

    if (inQuiet) {
      await admin
        .from("notifications")
        .update({ delivered: false, delivery_result: { skipped: "quiet_hours" } })
        .eq("id", notifRow!.id);
      return json({ ok: true, notification_id: notifRow?.id, skipped: "quiet_hours" });
    }

    // Resolve agent phone
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    const agentPhone = authUser?.user?.phone || null;

    let delivered = false;
    let deliveryResult: Record<string, unknown> = { agent_phone_resolved: !!agentPhone };

    if (agentPhone) {
      try {
        const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
          },
          body: JSON.stringify({
            phone_number: agentPhone,
            message: text,
            tenant_id: userId,
          }),
        });
        delivered = sendRes.ok;
        deliveryResult = { ...deliveryResult, status: sendRes.status, ok: sendRes.ok };
        if (!sendRes.ok) {
          deliveryResult.body = (await sendRes.text()).slice(0, 400);
        }
      } catch (e) {
        deliveryResult.error = (e as Error).message;
      }
    } else {
      deliveryResult.reason = "Agent has no phone number on file";
    }

    await admin
      .from("notifications")
      .update({ delivered, delivery_result: deliveryResult })
      .eq("id", notifRow!.id);

    return json({ ok: true, notification_id: notifRow?.id, delivered, deliveryResult });
  } catch (e) {
    console.error("[notify-agent] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});

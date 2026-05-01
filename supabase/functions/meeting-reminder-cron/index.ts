// meeting-reminder-cron
//
// Invoked by pg_cron every 5 minutes. Looks for meetings starting in 50–70 min
// that haven't received a 1h reminder yet, then dispatches WhatsApp messages
// to BOTH the agent and the lead via the existing send-whatsapp gateway.
//
// The Google Calendar event itself also has 60-minute popup + email reminders
// (configured in createCalendarEvent), so the lead/agent get both.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function fmt(d: Date, tz: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

async function sendWA(payload: { phone_number: string; message: string; user_id: string; lead_id?: string | null }) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({
      phone_number: payload.phone_number,
      message: payload.message,
      lead_id: payload.lead_id ?? null,
      override_user_id: payload.user_id,
      sender_type: 'reminder',
    }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const now = new Date();
    const lower = new Date(now.getTime() + 50 * 60_000).toISOString();
    const upper = new Date(now.getTime() + 70 * 60_000).toISOString();

    const { data: meetings, error } = await admin
      .from('meetings')
      .select('id, user_id, lead_id, title, starts_at, ends_at, timezone, conference_link, lead_name, lead_phone')
      .eq('status', 'scheduled')
      .is('reminder_1h_sent_at', null)
      .gte('starts_at', lower)
      .lte('starts_at', upper)
      .limit(50);
    if (error) throw error;

    let processed = 0;
    for (const m of meetings || []) {
      // Agent phone via profiles? We use kb_whitelist as a stand-in if profiles has none.
      const { data: prof } = await admin
        .from('profiles')
        .select('phone, full_name')
        .eq('id', m.user_id)
        .maybeSingle();
      const agentPhone = (prof as any)?.phone as string | undefined;
      const startStr = fmt(new Date(m.starts_at as string), (m.timezone as string) || 'Asia/Jerusalem');
      const link = m.conference_link ? `\nLink: ${m.conference_link}` : '';

      const promises: Promise<boolean>[] = [];
      if (m.lead_phone) {
        promises.push(sendWA({
          phone_number: m.lead_phone as string,
          message: `Reminder: meeting in 1 hour at ${startStr}.${link}`,
          user_id: m.user_id as string,
          lead_id: m.lead_id as string | null,
        }));
      }
      if (agentPhone) {
        promises.push(sendWA({
          phone_number: agentPhone,
          message: `Reminder: ${m.title} with ${m.lead_name ?? 'lead'} starts at ${startStr}.${link}`,
          user_id: m.user_id as string,
          lead_id: m.lead_id as string | null,
        }));
      }
      await Promise.allSettled(promises);
      await admin
        .from('meetings')
        .update({ reminder_1h_sent_at: new Date().toISOString() })
        .eq('id', m.id);
      processed++;
    }

    return new Response(JSON.stringify({ processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[meeting-reminder-cron] fatal", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

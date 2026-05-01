// book-meeting
//
// PUBLIC endpoint (verify_jwt = false). Used by the lead's booking page.
//
// GET  ?token=...           -> returns proposed_slots, lead_name, agent display name
// POST { token, slot_start, lead_name?, lead_email? }
//   -> validates the slot, creates a Google Calendar event on the agent's
//      calendar (with the lead as an attendee so Google sends the invite
//      email), inserts a meetings row, links it to the lead, and updates the
//      lead's lead_stage to "negotiation".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  getFreshAccessToken,
  createCalendarEvent,
} from "../_shared/google-calendar.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      if (!token) return json({ error: "missing token" }, 400);
      const { data: bt } = await admin
        .from('booking_tokens')
        .select('token, status, lead_name, proposed_slots, duration_minutes, expires_at, user_id, meeting_id')
        .eq('token', token)
        .maybeSingle();
      if (!bt) return json({ error: "invalid token" }, 404);
      if (new Date(bt.expires_at as string) < new Date()) return json({ error: "expired" }, 410);
      // Look up agent display name
      const { data: prof } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', bt.user_id)
        .maybeSingle();
      return json({
        ok: true,
        status: bt.status,
        lead_name: bt.lead_name,
        proposed_slots: bt.proposed_slots,
        duration_minutes: bt.duration_minutes,
        agent_name: prof?.full_name || 'Your agent',
        booked_meeting_id: bt.meeting_id,
      });
    }

    // POST: confirm slot
    const body = await req.json().catch(() => ({}));
    const token = body.token as string | undefined;
    const slotStart = body.slot_start as string | undefined;
    if (!token || !slotStart) return json({ error: "missing token or slot_start" }, 400);

    const { data: bt } = await admin
      .from('booking_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    if (!bt) return json({ error: "invalid token" }, 404);
    if (bt.status !== 'pending') return json({ error: `already ${bt.status}` }, 409);
    if (new Date(bt.expires_at as string) < new Date()) return json({ error: "expired" }, 410);

    const slots = (bt.proposed_slots as any[]) || [];
    const chosen = slots.find((s) => s.start === slotStart);
    if (!chosen) return json({ error: "slot not in proposed list" }, 400);

    // Resolve agent token
    const tok = await getFreshAccessToken(admin, bt.user_id as string);
    if ('error' in tok) return json({ error: `agent calendar: ${tok.error}` }, 502);

    // Allow lead to update name/email at confirm time
    const leadName = (body.lead_name as string | undefined) || bt.lead_name || 'Lead';
    const leadEmail = (body.lead_email as string | undefined) || bt.lead_email || null;
    const leadPhone = bt.lead_phone;

    const attendees: { email: string; displayName?: string }[] = [];
    if (leadEmail) attendees.push({ email: leadEmail, displayName: leadName });

    const ev = await createCalendarEvent({
      accessToken: tok.accessToken,
      calendarId: tok.calendarId,
      timezone: tok.timezone,
      summary: `Realtyz · Meeting with ${leadName}`,
      description: `Auto-booked via Realtyz.\n\nLead: ${leadName}${leadPhone ? `\nPhone: ${leadPhone}` : ''}`,
      startISO: chosen.start,
      endISO: chosen.end,
      attendees,
    });
    if ('error' in ev) return json({ error: `calendar: ${ev.error}` }, 502);

    // Insert meetings row
    const { data: meeting, error: mErr } = await admin
      .from('meetings')
      .insert({
        user_id: bt.user_id,
        lead_id: bt.lead_id,
        title: `Meeting with ${leadName}`,
        description: 'Booked via public link',
        starts_at: chosen.start,
        ends_at: chosen.end,
        timezone: tok.timezone,
        conference_link: ev.meetLink || null,
        google_calendar_event_id: ev.id,
        lead_name: leadName,
        lead_email: leadEmail,
        lead_phone: leadPhone,
        metadata: { booking_token: token, html_link: ev.htmlLink },
      })
      .select('id')
      .single();
    if (mErr) return json({ error: mErr.message }, 500);

    // Update booking token + lead stage
    await admin
      .from('booking_tokens')
      .update({
        status: 'booked',
        selected_slot: chosen.start,
        meeting_id: meeting.id,
        lead_name: leadName,
        lead_email: leadEmail,
      })
      .eq('id', bt.id);

    if (bt.lead_id) {
      await admin
        .from('leads')
        .update({ lead_stage: 'negotiation', last_interaction_at: new Date().toISOString() })
        .eq('id', bt.lead_id);
    }

    return json({
      ok: true,
      meeting_id: meeting.id,
      starts_at: chosen.start,
      ends_at: chosen.end,
      conference_link: ev.meetLink,
      html_link: ev.htmlLink,
    });
  } catch (e: any) {
    console.error("[book-meeting] fatal", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});

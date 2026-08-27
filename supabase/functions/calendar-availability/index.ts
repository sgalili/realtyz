// calendar-availability
//
// Authenticated agent endpoint: returns 3 free slots from the agent's Google
// Calendar plus a fresh booking_token + public booking link to share with the
// lead. The chat AI or the Deal Room "Propose Times" button calls this.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  getFreshAccessToken,
  computeFreeSlots,
} from "../_shared/google-calendar.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_PUBLIC_URL") || "https://realtyz.app";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const userId = u.user.id;

    const body = await req.json().catch(() => ({}));
    const leadId = (body.lead_id as string | undefined) || null;
    const duration = Math.min(180, Math.max(15, Number(body.duration_minutes) || 30));
    const createBookingToken = body.create_booking_token !== false;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let lead: { full_name: string | null; phone_number: string | null; email: string | null } | null = null;
    if (leadId) {
      const { data } = await admin
        .from('leads')
        .select('full_name, phone_number, email')
        .eq('id', leadId)
        .maybeSingle();
      lead = data as any;
    }

    const tok = await getFreshAccessToken(admin, userId);
    if ('error' in tok) return json({ error: tok.error }, 400);

    const slotsRes = await computeFreeSlots({
      accessToken: tok.accessToken,
      calendarId: tok.calendarId,
      timezone: tok.timezone,
      durationMinutes: duration,
      count: 3,
    });
    if ('error' in slotsRes) return json({ error: slotsRes.error }, 400);

    if (!createBookingToken) {
      return json({ ok: true, slots: slotsRes.slots, timezone: tok.timezone });
    }

    const token = randomToken();
    const { data: bt, error: btErr } = await admin
      .from('booking_tokens')
      .insert({
        token,
        user_id: userId,
        lead_id: leadId,
        lead_name: lead?.full_name ?? null,
        lead_phone: lead?.phone_number ?? null,
        lead_email: lead?.email ?? null,
        proposed_slots: slotsRes.slots,
        duration_minutes: duration,
      })
      .select('id, token, expires_at')
      .single();
    if (btErr) return json({ error: btErr.message }, 500);

    return json({
      ok: true,
      slots: slotsRes.slots,
      timezone: tok.timezone,
      token: bt.token,
      booking_url: `${APP_URL}/book/${bt.token}`,
      expires_at: bt.expires_at,
    });
  } catch (e: any) {
    console.error("[calendar-availability] fatal", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});

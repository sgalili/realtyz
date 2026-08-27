import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";
import { createCalendarEvent, getFreshAccessToken } from "../_shared/google-calendar.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const BodySchema = z.object({
  title: z.string().trim().min(1).max(255),
  notes: z.string().max(5000).optional().default(""),
  starts_at: z.string().datetime(),
  duration_minutes: z.number().int().min(15).max(180).default(30),
  lead_id: z.string().uuid().nullable().optional(),
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: authData } = await userClient.auth.getUser();
    const user = authData.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const token = await getFreshAccessToken(admin, user.id);
    if ("error" in token) return json({ error: token.error }, 400);

    const start = new Date(parsed.data.starts_at);
    const end = new Date(start.getTime() + parsed.data.duration_minutes * 60_000);
    const event = await createCalendarEvent({
      accessToken: token.accessToken,
      calendarId: token.calendarId,
      timezone: token.timezone,
      summary: parsed.data.title,
      description: parsed.data.notes || undefined,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
    });
    if ("error" in event) return json({ error: event.error }, 502);
    return json({ ok: true, event_id: event.id, html_link: event.htmlLink ?? null });
  } catch (error) {
    console.error("[calendar-schedule-action]", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
// Shared helpers for Google Calendar OAuth + slot computation.
// Uses the social_connections row (platform='google_calendar') created by
// google-oauth-exchange. Refreshes the access_token if expired.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type Admin = ReturnType<typeof createClient>;

export type GoogleCalCreds = {
  access_token?: string;
  refresh_token?: string;
  oauth_client_id?: string;
  oauth_client_secret?: string;
  token_scope?: string;
};

export async function loadCalendarCreds(admin: Admin, userId: string): Promise<{
  creds: GoogleCalCreds;
  rowId: string;
  calendarId: string;
  timezone: string;
} | null> {
  const { data: row } = await admin
    .from('social_connections')
    .select('id, credentials')
    .eq('platform', 'google_calendar')
    .eq('created_by', userId)
    .maybeSingle();
  if (!row) return null;
  const creds = (row.credentials as any)?.manual ?? {};
  const identity = (row.credentials as any)?.verified_identity ?? {};
  return {
    creds,
    rowId: row.id as string,
    calendarId: identity.calendar_id || 'primary',
    timezone: identity.timezone || 'Asia/Jerusalem',
  };
}

async function resolveClientCreds(admin: Admin, creds: GoogleCalCreds) {
  let clientId = creds.oauth_client_id;
  let clientSecret = creds.oauth_client_secret;
  if (!clientId || !clientSecret) {
    const { data: shared } = await admin
      .from('platform_oauth_apps')
      .select('client_id, client_secret')
      .eq('platform', 'google')
      .maybeSingle();
    if (shared?.client_id && shared?.client_secret) {
      clientId = shared.client_id as string;
      clientSecret = shared.client_secret as string;
    }
  }
  if (!clientId || !clientSecret) {
    clientId = Deno.env.get('GOOGLE_CLIENT_ID')?.trim();
    clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')?.trim();
  }
  return { clientId, clientSecret };
}

export async function getFreshAccessToken(admin: Admin, userId: string): Promise<{
  accessToken: string;
  calendarId: string;
  timezone: string;
} | { error: string }> {
  const loaded = await loadCalendarCreds(admin, userId);
  if (!loaded) return { error: 'google_calendar not connected for user' };
  const { creds, rowId, calendarId, timezone } = loaded;

  // Try a cheap probe with the existing access_token first.
  if (creds.access_token) {
    const probe = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary',
      { headers: { Authorization: `Bearer ${creds.access_token}` } },
    );
    if (probe.ok) return { accessToken: creds.access_token, calendarId, timezone };
  }

  if (!creds.refresh_token) return { error: 'no refresh_token; reconnect Google Calendar' };
  const { clientId, clientSecret } = await resolveClientCreds(admin, creds);
  if (!clientId || !clientSecret) return { error: 'missing Google OAuth client credentials' };

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    return { error: json.error_description || json.error || `refresh failed ${res.status}` };
  }
  // Persist the new access_token
  const newCreds = { ...creds, access_token: json.access_token };
  await admin
    .from('social_connections')
    .update({
      credentials: { ...(loaded as any), manual: newCreds },
      last_test_at: new Date().toISOString(),
      last_test_status: 'ok',
    })
    .eq('id', rowId);
  return { accessToken: json.access_token, calendarId, timezone };
}

// Compute up to N free slots from now+leadHours until +daysAhead, looking at
// the agent's busy times via FreeBusy API.
export async function computeFreeSlots(opts: {
  accessToken: string;
  calendarId: string;
  timezone: string;
  durationMinutes: number;
  leadHours?: number;        // earliest start, default 4h from now
  daysAhead?: number;        // search window, default 5 days
  workdayStartHour?: number; // local hour, default 9
  workdayEndHour?: number;   // local hour, default 18
  count?: number;            // default 3
}): Promise<{ slots: { start: string; end: string }[] } | { error: string }> {
  const lead = opts.leadHours ?? 4;
  const days = opts.daysAhead ?? 5;
  const startH = opts.workdayStartHour ?? 9;
  const endH = opts.workdayEndHour ?? 18;
  const count = opts.count ?? 3;
  const dur = opts.durationMinutes;

  const timeMin = new Date(Date.now() + lead * 3600_000);
  const timeMax = new Date(timeMin.getTime() + days * 86400_000);

  const fb = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: opts.timezone,
      items: [{ id: opts.calendarId }],
    }),
  });
  const fbJson = await fb.json().catch(() => ({}));
  if (!fb.ok) return { error: fbJson.error?.message || `freeBusy ${fb.status}` };
  const busy: { start: string; end: string }[] =
    fbJson.calendars?.[opts.calendarId]?.busy ?? [];

  const slots: { start: string; end: string }[] = [];
  // Iterate hour-by-hour candidate starts.
  const cursor = new Date(timeMin);
  cursor.setMinutes(0, 0, 0);
  while (cursor < timeMax && slots.length < count) {
    // Convert to local-of-timezone roughly (we just clamp by UTC hour - good enough for v1).
    const hour = cursor.getUTCHours();
    if (hour < startH || hour >= endH) {
      cursor.setUTCHours(cursor.getUTCHours() + 1);
      continue;
    }
    const start = new Date(cursor);
    const end = new Date(start.getTime() + dur * 60_000);
    const conflict = busy.some((b) => {
      const bs = new Date(b.start).getTime();
      const be = new Date(b.end).getTime();
      return start.getTime() < be && end.getTime() > bs;
    });
    if (!conflict) {
      slots.push({ start: start.toISOString(), end: end.toISOString() });
      // skip 2 hours after a chosen slot to spread suggestions.
      cursor.setTime(end.getTime() + 2 * 3600_000);
    } else {
      cursor.setUTCHours(cursor.getUTCHours() + 1);
    }
  }
  return { slots };
}

export async function createCalendarEvent(opts: {
  accessToken: string;
  calendarId: string;
  timezone: string;
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  attendees?: { email: string; displayName?: string }[];
  location?: string;
}): Promise<{ id: string; htmlLink?: string; meetLink?: string } | { error: string }> {
  const body: any = {
    summary: opts.summary,
    description: opts.description,
    start: { dateTime: opts.startISO, timeZone: opts.timezone },
    end: { dateTime: opts.endISO, timeZone: opts.timezone },
    attendees: opts.attendees,
    location: opts.location,
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'email', minutes: 60 },
      ],
    },
    conferenceData: {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(opts.calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json.error?.message || `events ${res.status}` };
  const meetLink =
    json.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri;
  return { id: json.id as string, htmlLink: json.htmlLink, meetLink };
}

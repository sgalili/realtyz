// supabase/functions/monitor-social-connections/index.ts
//
// Runs once a day (via pg_cron) and probes every connected social account
// for tenant `created_by`. If a token is broken/revoked we mark the row
// last_test_status='auth_failed' AND insert an admin_lead so the
// Super-Admin Dashboard surfaces a 🔴 "Action Required" card.
//
// No JWT required (verify_jwt=false in config.toml) so pg_cron can hit it
// with a service-role bearer.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Platform = string;

interface ProbeOutcome {
  ok: boolean;
  status: string;
  message: string;
}

async function probeGoogleToken(accessToken: string): Promise<ProbeOutcome> {
  try {
    const r = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    );
    if (r.ok) return { ok: true, status: 'valid', message: 'Google token חי' };
    if (r.status === 400 || r.status === 401) {
      return { ok: false, status: 'token_expired', message: 'Google Access Token פג / נשלל' };
    }
    return { ok: false, status: 'unknown', message: `Google tokeninfo ${r.status}` };
  } catch {
    return { ok: false, status: 'unreachable', message: 'לא הצלחנו להגיע ל-Google' };
  }
}

async function probeLinkedInToken(accessToken: string): Promise<ProbeOutcome> {
  try {
    const r = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (r.ok) return { ok: true, status: 'valid', message: 'LinkedIn token חי' };
    if (r.status === 401) return { ok: false, status: 'token_expired', message: 'LinkedIn Access Token פג / נשלל' };
    return { ok: false, status: 'unknown', message: `LinkedIn userinfo ${r.status}` };
  } catch {
    return { ok: false, status: 'unreachable', message: 'לא הצלחנו להגיע ל-LinkedIn' };
  }
}

const MONITORED = new Set(['gmail', 'youtube', 'google_drive', 'linkedin']);

async function probeRow(platform: Platform, creds: Record<string, unknown>): Promise<ProbeOutcome | null> {
  if (!MONITORED.has(platform)) return null;
  const tokens = (creds.tokens ?? {}) as Record<string, unknown>;
  const accessToken = tokens.access_token as string | undefined;
  if (!accessToken) {
    return { ok: false, status: 'no_token', message: 'אין Access Token שמור — דרוש חיבור מחדש' };
  }
  if (platform === 'linkedin') {
    return probeLinkedInToken(accessToken);
  }
  return probeGoogleToken(accessToken);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: rows, error } = await admin
      .from('social_connections')
      .select('id, platform, display_name, credentials, created_by, is_connected')
      .eq('is_connected', true);
    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];
    let alerts = 0;

    for (const row of rows ?? []) {
      const creds = (row.credentials as Record<string, unknown> | null) ?? {};
      const outcome = await probeRow(row.platform, creds);
      if (!outcome) continue;

      const checked_at = new Date().toISOString();
      const next = {
        ...creds,
        health_check: {
          ok: outcome.ok,
          status: outcome.status,
          message: outcome.message,
          checked_at,
        },
      };
      await admin
        .from('social_connections')
        .update({
          credentials: next as never,
          last_test_at: checked_at,
          last_test_status: outcome.ok ? 'ok' : 'auth_failed',
          last_test_message: outcome.message,
        })
        .eq('id', row.id);

      if (!outcome.ok && row.created_by) {
        // Look up actor email for context
        const { data: profile } = await admin
          .from('profiles')
          .select('email')
          .eq('id', row.created_by)
          .maybeSingle();

        await admin.from('admin_leads').insert({
          user_id: row.created_by,
          user_email: profile?.email ?? null,
          lead_type: 'connection_health',
          status: 'new',
          metadata: {
            platform: row.platform,
            display_name: row.display_name,
            probe_status: outcome.status,
            probe_message: outcome.message,
            checked_at,
          },
        });
        alerts++;
      }

      results.push({
        platform: row.platform,
        display_name: row.display_name,
        ok: outcome.ok,
        status: outcome.status,
      });
    }

    return new Response(
      JSON.stringify({ ok: true, scanned: results.length, alerts, results, ran_at: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Monitor failed';
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

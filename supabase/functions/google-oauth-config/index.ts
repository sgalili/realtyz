// supabase/functions/google-oauth-config/index.ts
//
// Lightweight config resolver for the Google OAuth popup flow.
// Returns the OAuth client_id the SPA should use to build the consent URL,
// resolving in priority order:
//   1. platform_oauth_apps row for 'google' (shared workspace app)
//   2. GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET project secrets
//
// Never returns the client_secret — only the public client_id.
// Auth: requires a logged-in user.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Shared workspace Google OAuth app.
    const { data: shared } = await admin
      .from('platform_oauth_apps')
      .select('client_id, client_secret')
      .eq('platform', 'google')
      .maybeSingle();

    if (shared?.client_id && shared?.client_secret) {
      return json({ ok: true, configured: true, client_id: shared.client_id, source: 'shared' });
    }

    // 2. Project-level secrets.
    const envClientId = (Deno.env.get('GOOGLE_CLIENT_ID') ?? '').trim();
    const envClientSecret = (Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '').trim();
    if (envClientId && envClientSecret) {
      return json({ ok: true, configured: true, client_id: envClientId, source: 'env' });
    }

    // Nothing configured — return a graceful, actionable payload.
    return json({
      ok: true,
      configured: false,
      source: null,
      missing: [
        !shared?.client_id && !envClientId ? 'GOOGLE_CLIENT_ID' : null,
        !shared?.client_secret && !envClientSecret ? 'GOOGLE_CLIENT_SECRET' : null,
      ].filter(Boolean),
    });
  } catch (err: any) {
    console.error('google-oauth-config error', err);
    return json({ ok: false, configured: false, error: err?.message ?? 'Unknown error' }, 200);
  }
});

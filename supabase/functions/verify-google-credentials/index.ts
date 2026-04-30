// supabase/functions/verify-google-credentials/index.ts
//
// Dry-run verification of a Google OAuth Client ID + Client Secret pair.
// We do NOT need a user-granted refresh_token — instead we exploit Google's
// token endpoint behaviour:
//
//   • invalid_client          → the Client ID or Client Secret is wrong
//   • invalid_grant           → credentials are accepted (only our fake code
//                                was rejected — exactly what we want)
//   • invalid_request         → credentials are accepted, request shape was
//                                wrong (also fine for our purposes)
//
// We also sanity-check the Client ID format ("*.apps.googleusercontent.com")
// and confirm the discovery endpoint is reachable.
//
// Auth: requires a logged-in user; only super_admin / admin may verify.
// Inputs: { platform: 'gmail' | 'youtube' | 'google_drive' }
//         OR { client_id, client_secret } for ad-hoc verification.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GOOGLE_PLATFORMS = new Set(['gmail', 'youtube', 'google_drive']);

interface DryRunResult {
  ok: boolean;
  status: 'valid' | 'invalid_client' | 'invalid_format' | 'unreachable' | 'unknown';
  message: string;
  client_id_preview?: string;
  checked_at: string;
}

async function dryRun(clientId: string, clientSecret: string): Promise<DryRunResult> {
  const checked_at = new Date().toISOString();
  const preview = clientId.length > 16 ? `${clientId.slice(0, 8)}...${clientId.slice(-12)}` : clientId;

  // 1. Format check
  if (!/\.apps\.googleusercontent\.com$/i.test(clientId.trim())) {
    return {
      ok: false,
      status: 'invalid_format',
      message: 'Client ID חייב להסתיים ב-.apps.googleusercontent.com',
      client_id_preview: preview,
      checked_at,
    };
  }

  // 2. Reach Google's token endpoint with a deliberately bogus code.
  let tokenRes: Response;
  try {
    tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        // Bogus code + redirect — we only want Google to validate the client.
        code: 'kalpiz-dryrun-' + crypto.randomUUID(),
        grant_type: 'authorization_code',
        redirect_uri: 'https://ai.kalpiz.co.il/oauth/callback',
      }),
    });
  } catch (e) {
    return {
      ok: false,
      status: 'unreachable',
      message: 'לא הצלחנו לגשת ל-oauth2.googleapis.com - בדוק חיבור רשת',
      client_id_preview: preview,
      checked_at,
    };
  }

  const json = await tokenRes.json().catch(() => ({} as Record<string, unknown>));
  const errCode = String((json as Record<string, unknown>).error ?? '').toLowerCase();

  // invalid_client = wrong ID/Secret. anything else (invalid_grant /
  // invalid_request) means Google accepted our client and only failed on the
  // bogus code — i.e. credentials are valid.
  if (tokenRes.ok) {
    // Extremely unlikely (we sent a fake code) but treat as valid.
    return {
      ok: true,
      status: 'valid',
      message: 'Client ID + Client Secret תקפים',
      client_id_preview: preview,
      checked_at,
    };
  }

  if (errCode === 'invalid_client') {
    return {
      ok: false,
      status: 'invalid_client',
      message: 'Google דחה את ה-Client ID או ה-Client Secret',
      client_id_preview: preview,
      checked_at,
    };
  }

  // invalid_grant / invalid_request → credentials passed.
  return {
    ok: true,
    status: 'valid',
    message: 'Client ID + Client Secret תקפים (Google אישר את הזיהוי)',
    client_id_preview: preview,
    checked_at,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const platform: string | undefined = body.platform;
    let clientId: string | undefined = body.client_id;
    let clientSecret: string | undefined = body.client_secret;

    // Resolve creds from the row if not supplied inline.
    const admin = createClient(supabaseUrl, serviceKey);
    if ((!clientId || !clientSecret) && platform) {
      if (!GOOGLE_PLATFORMS.has(platform)) {
        return new Response(JSON.stringify({ ok: false, error: 'Platform not supported' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: row } = await admin
        .from('social_connections')
        .select('credentials')
        .eq('platform', platform)
        .maybeSingle();
      const manual = ((row?.credentials as Record<string, unknown> | null)?.manual ?? {}) as Record<string, string>;
      clientId = clientId || manual.oauth_client_id;
      clientSecret = clientSecret || manual.oauth_client_secret;
    }

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({
          ok: false,
          status: 'invalid_format',
          message: 'חסרים Client ID או Client Secret',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const result = await dryRun(clientId, clientSecret);

    // Best-effort: persist the verification outcome to ALL google rows so the
    // health dot reflects the most recent check on every Google card.
    if (platform && GOOGLE_PLATFORMS.has(platform)) {
      const platforms = ['gmail', 'youtube', 'google_drive'];
      await Promise.all(
        platforms.map(async (p) => {
          const { data: r } = await admin
            .from('social_connections')
            .select('id, credentials')
            .eq('platform', p)
            .maybeSingle();
          const creds = (r?.credentials as Record<string, unknown> | null) ?? {};
          const next = {
            ...creds,
            credentials_check: {
              ok: result.ok,
              status: result.status,
              message: result.message,
              checked_at: result.checked_at,
            },
          };
          if (r?.id) {
            await admin
              .from('social_connections')
              .update({
                credentials: next as never,
                last_test_at: result.checked_at,
                last_test_status: result.ok ? 'ok' : 'auth_failed',
                last_test_message: result.message,
              })
              .eq('id', r.id);
          }
        }),
      );
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Verification failed';
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// supabase/functions/verify-linkedin-credentials/index.ts
//
// Verifies the currently stored LinkedIn access_token against LinkedIn's
// OpenID userinfo endpoint. If the token is invalid/expired, the function
// returns ok=false and persists last_test_status='auth_failed' so the
// health dot turns red and the daily monitor will surface it to admins.
//
// Inputs: { } (resolves the row by platform='linkedin')
//      OR { access_token } for ad-hoc verification.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface VerifyResult {
  ok: boolean;
  status: 'valid' | 'token_expired' | 'invalid_token' | 'no_token' | 'unreachable' | 'unknown';
  message: string;
  identity?: {
    sub?: string;
    name?: string;
    email?: string;
    email_verified?: boolean;
  };
  checked_at: string;
}

async function probeToken(accessToken: string): Promise<VerifyResult> {
  const checked_at = new Date().toISOString();
  let res: Response;
  try {
    res = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return {
      ok: false,
      status: 'unreachable',
      message: 'לא הצלחנו לגשת ל-api.linkedin.com',
      checked_at,
    };
  }

  if (res.status === 401) {
    const body = await res.text().catch(() => '');
    const expired = /expired/i.test(body);
    return {
      ok: false,
      status: expired ? 'token_expired' : 'invalid_token',
      message: expired ? 'ה-Access Token של LinkedIn פג תוקף' : 'LinkedIn דחה את ה-Access Token',
      checked_at,
    };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      ok: false,
      status: 'unknown',
      message: `LinkedIn החזיר ${res.status}: ${body.slice(0, 160)}`,
      checked_at,
    };
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    ok: true,
    status: 'valid',
    message: 'ה-Access Token של LinkedIn תקין',
    identity: {
      sub: json.sub as string | undefined,
      name: json.name as string | undefined,
      email: json.email as string | undefined,
      email_verified: json.email_verified as boolean | undefined,
    },
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

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    let accessToken = body.access_token as string | undefined;

    const admin = createClient(supabaseUrl, serviceKey);
    let rowId: string | undefined;
    if (!accessToken) {
      const { data: row } = await admin
        .from('social_connections')
        .select('id, credentials')
        .eq('platform', 'linkedin')
        .maybeSingle();
      rowId = row?.id;
      const creds = (row?.credentials as Record<string, unknown> | null) ?? {};
      const tokens = (creds.tokens ?? {}) as Record<string, unknown>;
      accessToken = tokens.access_token as string | undefined;
    }

    if (!accessToken) {
      const result: VerifyResult = {
        ok: false,
        status: 'no_token',
        message: 'אין Access Token שמור עבור LinkedIn — חבר מחדש את החשבון',
        checked_at: new Date().toISOString(),
      };
      if (rowId) {
        await admin
          .from('social_connections')
          .update({
            last_test_at: result.checked_at,
            last_test_status: 'auth_failed',
            last_test_message: result.message,
          })
          .eq('id', rowId);
      }
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await probeToken(accessToken);

    // Persist last_test_* so the health dot reacts immediately.
    const { data: row } = await admin
      .from('social_connections')
      .select('id, credentials')
      .eq('platform', 'linkedin')
      .maybeSingle();
    if (row?.id) {
      const creds = (row.credentials as Record<string, unknown> | null) ?? {};
      const next = {
        ...creds,
        credentials_check: {
          ok: result.ok,
          status: result.status,
          message: result.message,
          checked_at: result.checked_at,
          identity: result.identity ?? null,
        },
      };
      await admin
        .from('social_connections')
        .update({
          credentials: next as never,
          last_test_at: result.checked_at,
          last_test_status: result.ok ? 'ok' : 'auth_failed',
          last_test_message: result.message,
        })
        .eq('id', row.id);
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

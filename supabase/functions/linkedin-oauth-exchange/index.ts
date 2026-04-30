// supabase/functions/linkedin-oauth-exchange/index.ts
//
// Mirrors google-oauth-exchange but for LinkedIn (BYOK per-admin):
//   1. Receives { platform, code, redirect_uri } from the SPA after popup callback.
//   2. Loads oauth_client_id / oauth_client_secret from social_connections.credentials.manual.
//   3. Exchanges the auth code for access_token (LinkedIn's v2 token endpoint).
//   4. Calls LinkedIn `userinfo` (OpenID Connect) for the verified profile.
//   5. Persists tokens + identity + marks the connection LIVE.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ExchangeBody {
  platform?: string;
  code?: string;
  redirect_uri?: string;
}

async function exchangeCode(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<
  | { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }
  | { error: string }
> {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: params.clientId,
      client_secret: params.clientSecret,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      error:
        json.error_description ||
        json.error ||
        `LinkedIn token endpoint returned ${res.status}`,
    };
  }
  return json;
}

async function fetchLinkedInIdentity(accessToken: string) {
  // OpenID Connect userinfo (requires `openid profile email` scopes — already in OAUTH_SCOPES.linkedin).
  const res = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: json.message || `userinfo ${res.status}`, status: res.status };
  }
  const name = json.name ?? [json.given_name, json.family_name].filter(Boolean).join(' ').trim() ?? 'LinkedIn user';
  return {
    platform: 'linkedin' as const,
    account_name: name,
    email: json.email,
    picture: json.picture,
    sub: json.sub,
    locale: json.locale,
    verified_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: isAdmin } = await admin.rpc('is_admin_or_above', {
      _uid: userData.user.id,
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden — admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: ExchangeBody = await req.json().catch(() => ({}));
    const platform = String(body.platform || '').toLowerCase();
    const code = body.code;
    const redirectUri = body.redirect_uri;

    if (platform !== 'linkedin') {
      return new Response(
        JSON.stringify({ error: 'platform must be "linkedin"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!code || !redirectUri) {
      return new Response(
        JSON.stringify({ error: 'Missing code or redirect_uri' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: row } = await admin
      .from('social_connections')
      .select('id, credentials, display_name')
      .eq('platform', platform)
      .maybeSingle();

    const manual = ((row?.credentials as any)?.manual ?? {}) as {
      oauth_client_id?: string;
      oauth_client_secret?: string;
    };

    if (!manual.oauth_client_id || !manual.oauth_client_secret) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            'Missing LinkedIn Client ID/Secret. Open the gear icon, paste them, save, then retry.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const tokens = await exchangeCode({
      clientId: manual.oauth_client_id,
      clientSecret: manual.oauth_client_secret,
      code,
      redirectUri,
    });
    if ('error' in tokens) {
      await admin
        .from('social_connections')
        .update({
          last_test_at: new Date().toISOString(),
          last_test_status: 'auth_failed',
          last_test_message: `Code exchange failed: ${tokens.error}`,
        })
        .eq('platform', platform);
      return new Response(JSON.stringify({ ok: false, error: tokens.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const identity = await fetchLinkedInIdentity(tokens.access_token);
    if ('error' in identity) {
      await admin
        .from('social_connections')
        .update({
          last_test_at: new Date().toISOString(),
          last_test_status: identity.status === 403 ? 'scope_missing' : 'auth_failed',
          last_test_message: identity.error,
        })
        .eq('platform', platform);
      return new Response(
        JSON.stringify({ ok: false, error: identity.error, status: identity.status }),
        {
          status: identity.status === 403 ? 403 : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const prevCreds = (row?.credentials as Record<string, unknown> | null) ?? {};
    const prevManual = ((prevCreds as any).manual ?? {}) as Record<string, string>;

    const newCreds = {
      ...prevCreds,
      account_name: identity.account_name,
      verified_identity: identity,
      connection_status: 'CONNECTED',
      manual: {
        ...prevManual,
        access_token: tokens.access_token,
        ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
        token_scope: tokens.scope ?? prevManual.token_scope ?? '',
        ...(tokens.expires_in ? { token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString() } : {}),
      },
    };

    const sessionMarker = `li_${tokens.access_token.slice(0, 32)}_${Date.now()}`;

    const upd = {
      platform,
      display_name: row?.display_name ?? 'LinkedIn Profile',
      credentials: newCreds,
      encrypted_session: sessionMarker,
      session_method: 'oauth' as const,
      is_connected: true,
      connected_at: new Date().toISOString(),
      last_test_at: new Date().toISOString(),
      last_test_status: 'ok',
      last_test_message: 'LinkedIn OAuth completed and identity verified',
    };

    if (row?.id) {
      const { error } = await admin
        .from('social_connections')
        .update(upd)
        .eq('id', row.id);
      if (error) throw error;
    } else {
      const { error } = await admin.from('social_connections').insert(upd);
      if (error) throw error;
    }

    return new Response(JSON.stringify({ ok: true, identity }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('linkedin-oauth-exchange error', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

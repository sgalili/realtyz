// supabase/functions/verify-google-identity/index.ts
//
// Verifies a Google (Gmail / YouTube) connection by calling the actual
// Google APIs with the credentials saved in social_connections.credentials.manual.
// Writes the real identity (email or YouTube channel title + subscriber count)
// back into the row, so the UI can show the truth instead of a placeholder.
//
// Auth: requires a logged-in user; only super_admin / admin may verify.
// Inputs: { platform: 'gmail' | 'youtube' }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ManualCreds {
  oauth_client_id?: string;
  oauth_client_secret?: string;
  access_token?: string;
  refresh_token?: string;
  workspace_domain?: string;
  api_key?: string;
}

interface SendAsInfo {
  can_send: boolean;
  primary_address?: string;
  authorized_addresses?: string[];
  domain_authorized?: boolean;     // true when at least one verified address belongs to TARGET_DOMAIN
  target_domain?: string;
  notes?: string;
}

interface VerifiedIdentity {
  platform: 'gmail' | 'youtube';
  account_name: string;
  email?: string;
  channel_id?: string;
  channel_title?: string;
  subscriber_count?: number;
  scopes?: string[];
  send_as?: SendAsInfo;
  verified_at: string;
}

const TARGET_DOMAIN = 'kalpiz.co.il';

/**
 * Exchange a refresh_token for a fresh access_token (Google).
 */
async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ access_token: string; scope?: string } | { error: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: json.error_description || json.error || `Google token endpoint ${res.status}` };
  }
  return { access_token: json.access_token, scope: json.scope };
}

async function fetchGmailSendAs(accessToken: string): Promise<SendAsInfo> {
  // Requires gmail.readonly or gmail.settings.basic. If the scope is missing
  // we still return a meaningful response.
  try {
    const res = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      if (res.status === 403) {
        return {
          can_send: false,
          target_domain: TARGET_DOMAIN,
          notes: 'אין הרשאת gmail.settings.basic לבדיקת sendAs',
        };
      }
      return {
        can_send: false,
        target_domain: TARGET_DOMAIN,
        notes: `gmail/sendAs ${res.status}`,
      };
    }
    const json = await res.json().catch(() => ({} as any));
    const list = Array.isArray(json.sendAs) ? json.sendAs : [];
    const verified: string[] = list
      .filter((s: any) => s?.verificationStatus === 'accepted' || s?.isPrimary)
      .map((s: any) => String(s?.sendAsEmail ?? ''))
      .filter(Boolean);
    const primary = list.find((s: any) => s?.isPrimary)?.sendAsEmail as string | undefined;
    const domainAuthorized = verified.some((addr) =>
      addr.toLowerCase().endsWith('@' + TARGET_DOMAIN),
    );
    return {
      can_send: verified.length > 0,
      primary_address: primary,
      authorized_addresses: verified,
      domain_authorized: domainAuthorized,
      target_domain: TARGET_DOMAIN,
      notes: domainAuthorized
        ? `מורשה לשלוח גם בשם ${TARGET_DOMAIN}`
        : verified.length > 0
        ? `מורשה לשלוח כחשבון עצמאי בלבד (לא בשם ${TARGET_DOMAIN})`
        : 'אין כתובות sendAs מאומתות',
    };
  } catch {
    return { can_send: false, target_domain: TARGET_DOMAIN, notes: 'sendAs request failed' };
  }
}

async function fetchGmailIdentity(accessToken: string): Promise<VerifiedIdentity | { error: string; status: number }> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) return { error: 'Access token is invalid or expired', status: 401 };
    if (res.status === 403) {
      return { error: 'Insufficient scopes — required: userinfo.email + userinfo.profile', status: 403 };
    }
    return { error: json.error?.message || `Google userinfo ${res.status}`, status: res.status };
  }
  const sendAs = await fetchGmailSendAs(accessToken);
  return {
    platform: 'gmail',
    account_name: json.email ?? 'Gmail',
    email: json.email,
    send_as: sendAs,
    verified_at: new Date().toISOString(),
  };
}

async function fetchYouTubeIdentity(accessToken: string): Promise<VerifiedIdentity | { error: string; status: number }> {
  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) return { error: 'Access token is invalid or expired', status: 401 };
    if (res.status === 403) {
      return { error: 'Insufficient scopes — required: youtube.readonly', status: 403 };
    }
    return { error: json.error?.message || `YouTube channels ${res.status}`, status: res.status };
  }
  const item = json.items?.[0];
  if (!item) return { error: 'No YouTube channel found for this account', status: 404 };
  const title = item.snippet?.title ?? 'YouTube Channel';
  const subs = item.statistics?.subscriberCount ? Number(item.statistics.subscriberCount) : undefined;
  return {
    platform: 'youtube',
    account_name: subs != null ? `${title} · ${subs.toLocaleString()} subs` : title,
    channel_id: item.id,
    channel_title: title,
    subscriber_count: subs,
    verified_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Per-request client to validate the caller.
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service-role client for DB ops (bypasses RLS for the read we need).
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Role check.
    const { data: isAdmin } = await admin.rpc('is_admin_or_above', { _uid: userData.user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden — admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const platform = String(body.platform || '').toLowerCase();
    if (platform !== 'gmail' && platform !== 'youtube') {
      return new Response(JSON.stringify({ error: 'platform must be "gmail" or "youtube"' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pull the saved manual credentials for this platform.
    const { data: row, error: rowErr } = await admin
      .from('social_connections')
      .select('id, credentials')
      .eq('platform', platform)
      .maybeSingle();
    if (rowErr) throw rowErr;
    const manual: ManualCreds = ((row?.credentials as any)?.manual ?? {}) as ManualCreds;

    // Resolve an access token: prefer refresh-grant over a raw access_token.
    let accessToken = manual.access_token;
    if (!accessToken && manual.refresh_token && manual.oauth_client_id && manual.oauth_client_secret) {
      const refreshed = await refreshAccessToken(
        manual.oauth_client_id,
        manual.oauth_client_secret,
        manual.refresh_token,
      );
      if ('error' in refreshed) {
        await admin.from('social_connections').update({
          last_test_at: new Date().toISOString(),
          last_test_status: 'auth_failed',
          last_test_message: `Refresh token rejected: ${refreshed.error}`,
        }).eq('platform', platform);
        return new Response(JSON.stringify({ ok: false, error: refreshed.error }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      accessToken = refreshed.access_token;
    }

    if (!accessToken) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Missing access_token / refresh_token. Open the gear icon and paste an OAuth Access Token (or a Refresh Token + Client ID/Secret).',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Hit the real Google API.
    const identity = platform === 'gmail'
      ? await fetchGmailIdentity(accessToken)
      : await fetchYouTubeIdentity(accessToken);

    if ('error' in identity) {
      await admin.from('social_connections').update({
        last_test_at: new Date().toISOString(),
        last_test_status: identity.status === 403 ? 'scope_missing' : 'auth_failed',
        last_test_message: identity.error,
      }).eq('platform', platform);
      return new Response(JSON.stringify({ ok: false, error: identity.error, status: identity.status }), {
        status: identity.status === 403 ? 403 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Persist the verified identity into the credentials blob.
    const prevCreds = (row?.credentials as Record<string, unknown> | null) ?? {};
    const { error: updErr } = await admin
      .from('social_connections')
      .update({
        credentials: {
          ...prevCreds,
          account_name: identity.account_name,
          verified_identity: identity,
        },
        last_test_at: new Date().toISOString(),
        last_test_status: 'ok',
        last_test_message: 'Identity verified against Google API',
      })
      .eq('platform', platform);
    if (updErr) throw updErr;

    return new Response(JSON.stringify({ ok: true, identity }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('verify-google-identity error', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

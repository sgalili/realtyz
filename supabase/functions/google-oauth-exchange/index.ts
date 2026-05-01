// supabase/functions/google-oauth-exchange/index.ts
//
// Completes the Google OAuth2 popup flow:
//   1. Receives { platform, code, redirect_uri } from the SPA after the
//      popup callback.
//   2. Loads the saved oauth_client_id / oauth_client_secret from
//      social_connections.credentials.manual.
//   3. Exchanges the authorization code for an access_token + refresh_token.
//   4. Calls the real Google API to fetch the actual identity (Gmail email
//      or YouTube channel + subs).
//   5. Persists tokens + verified identity + marks the connection LIVE
//      (encrypted_session non-empty so isLive() returns true).
//
// Auth: requires a logged-in admin / super_admin caller.

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
  /** When true, also mark the sibling Google service connected (Gmail ↔ Drive). */
  one_click?: boolean;
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
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const baseMsg =
      json.error_description ||
      json.error ||
      `Google token endpoint returned ${res.status}`;
    // The most common failure is redirect_uri_mismatch — surface the exact
    // redirect_uri the function sent so the user can paste it into Google
    // Cloud Console → Credentials → Authorized redirect URIs.
    const isMismatch = String(json.error || '').includes('redirect_uri_mismatch')
      || String(baseMsg).toLowerCase().includes('redirect_uri');
    return {
      error: isMismatch
        ? `${baseMsg} — Google rejected the redirect URI. Add this EXACT value to your OAuth client's Authorized redirect URIs in Google Cloud Console: ${params.redirectUri}`
        : baseMsg,
    };
  }
  return json;
}

async function fetchGmailIdentity(accessToken: string) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: json.error?.message || `userinfo ${res.status}`, status: res.status };
  }
  return {
    platform: 'gmail' as const,
    account_name: json.email ?? 'Gmail',
    email: json.email,
    verified_at: new Date().toISOString(),
  };
}

async function fetchYouTubeIdentity(accessToken: string) {
  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: json.error?.message || `youtube ${res.status}`, status: res.status };
  }
  const item = json.items?.[0];
  if (!item) return { error: 'No YouTube channel found for this account', status: 404 };
  const title = item.snippet?.title ?? 'YouTube Channel';
  const subs = item.statistics?.subscriberCount
    ? Number(item.statistics.subscriberCount)
    : undefined;
  return {
    platform: 'youtube' as const,
    account_name: subs != null ? `${title} · ${subs.toLocaleString()} subs` : title,
    channel_id: item.id,
    channel_title: title,
    subscriber_count: subs,
    verified_at: new Date().toISOString(),
  };
}

async function fetchDriveIdentity(accessToken: string) {
  // userinfo gives us the email; Drive about gives us the user's display name + storage quota.
  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userJson = await userRes.json().catch(() => ({}));
  if (!userRes.ok) {
    return { error: userJson.error?.message || `userinfo ${userRes.status}`, status: userRes.status };
  }
  const aboutRes = await fetch(
    'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress),storageQuota(limit,usage)',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const aboutJson = await aboutRes.json().catch(() => ({}));
  return {
    platform: 'google_drive' as const,
    account_name: aboutJson.user?.emailAddress ?? userJson.email ?? 'Google Drive',
    email: userJson.email,
    display_name: aboutJson.user?.displayName ?? userJson.name,
    storage_quota: aboutJson.storageQuota ?? null,
    verified_at: new Date().toISOString(),
  };
}

async function fetchCalendarIdentity(accessToken: string) {
  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userJson = await userRes.json().catch(() => ({}));
  if (!userRes.ok) {
    return { error: userJson.error?.message || `userinfo ${userRes.status}`, status: userRes.status };
  }
  // Probe primary calendar to confirm scope
  const calRes = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const calJson = await calRes.json().catch(() => ({}));
  if (!calRes.ok) {
    return { error: calJson.error?.message || `calendar ${calRes.status}`, status: calRes.status };
  }
  return {
    platform: 'google_calendar' as const,
    account_name: userJson.email ?? 'Google Calendar',
    email: userJson.email,
    calendar_id: calJson.id ?? 'primary',
    calendar_summary: calJson.summary ?? 'Primary',
    timezone: calJson.timeZone ?? 'UTC',
    verified_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Validate caller.
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

    if (platform !== 'gmail' && platform !== 'youtube' && platform !== 'google_drive' && platform !== 'google_calendar') {
      return new Response(
        JSON.stringify({ error: 'platform must be "gmail", "youtube", "google_drive", or "google_calendar"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!code || !redirectUri) {
      return new Response(
        JSON.stringify({ error: 'Missing code or redirect_uri' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Pull saved BYOK credentials — strictly scoped to the calling user so
    // we never accidentally write OAuth tokens onto another user's row.
    const callerUserId = userData.user.id;
    const { data: row } = await admin
      .from('social_connections')
      .select('id, credentials, display_name')
      .eq('platform', platform)
      .eq('created_by', callerUserId)
      .maybeSingle();

    const manual = ((row?.credentials as any)?.manual ?? {}) as {
      oauth_client_id?: string;
      oauth_client_secret?: string;
    };

    // Resolve client credentials: per-row BYOK takes priority, otherwise
    // fall back to the workspace-wide shared Google App so One-Click works
    // for any user without their own Cloud project.
    let clientId = manual.oauth_client_id;
    let clientSecret = manual.oauth_client_secret;
    let credentialSource: 'byok' | 'shared' | 'env' = 'byok';
    if (!clientId || !clientSecret) {
      const { data: shared } = await admin
        .from('platform_oauth_apps')
        .select('client_id, client_secret')
        .eq('platform', 'google')
        .maybeSingle();
      if (shared?.client_id && shared?.client_secret) {
        clientId = shared.client_id;
        clientSecret = shared.client_secret;
        credentialSource = 'shared';
      }
    }
    if (!clientId || !clientSecret) {
      const envClientId = Deno.env.get('GOOGLE_CLIENT_ID')?.trim();
      const envClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')?.trim();
      if (envClientId && envClientSecret) {
        clientId = envClientId;
        clientSecret = envClientSecret;
        credentialSource = 'env';
      }
    }

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            'אין Client ID/Secret זמינים. הוסיפו אישורי Google תחת אישורי OAuth משותפים (סופר-אדמין) או הזינו ידנית בהגדרות מתקדמות.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Exchange.
    const tokens = await exchangeCode({
      clientId: clientId!,
      clientSecret: clientSecret!,
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
        .eq('platform', platform)
        .eq('created_by', callerUserId);
      return new Response(JSON.stringify({ ok: false, error: tokens.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch real identity with the fresh access_token.
    const identity =
      platform === 'gmail'
        ? await fetchGmailIdentity(tokens.access_token)
        : platform === 'youtube'
          ? await fetchYouTubeIdentity(tokens.access_token)
          : platform === 'google_calendar'
            ? await fetchCalendarIdentity(tokens.access_token)
            : await fetchDriveIdentity(tokens.access_token);

    if ('error' in identity) {
      await admin
        .from('social_connections')
        .update({
          last_test_at: new Date().toISOString(),
          last_test_status: identity.status === 403 ? 'scope_missing' : 'auth_failed',
          last_test_message: identity.error,
        })
        .eq('platform', platform)
        .eq('created_by', callerUserId);
      return new Response(
        JSON.stringify({ ok: false, error: identity.error, status: identity.status }),
        {
          status: identity.status === 403 ? 403 : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Persist tokens + identity + mark LIVE.
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
        // only overwrite refresh_token if Google returned a new one
        ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
        token_scope: tokens.scope ?? prevManual.token_scope ?? '',
      },
    };

    // Use the access_token (truncated) as a session marker so isLive() flips on.
    const sessionMarker = `goog_${tokens.access_token.slice(0, 32)}_${Date.now()}`;

    const upd = {
      platform,
      created_by: callerUserId,
      display_name: row?.display_name ?? (platform === 'gmail' ? 'Gmail · Google Workspace' : platform === 'youtube' ? 'YouTube' : platform === 'google_calendar' ? 'Google Calendar' : 'Google Drive'),
      credentials: newCreds,
      encrypted_session: sessionMarker,
      session_method: 'oauth' as const,
      is_connected: true,
      connected_at: new Date().toISOString(),
      last_test_at: new Date().toISOString(),
      last_test_status: 'ok',
      last_test_message: 'OAuth completed and identity verified',
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

    // ── One-Click sibling mirror ─────────────────────────────────────
    // For Gmail/Drive (which share the same Google account), also flip
    // the sibling card to "connected" so the user gets BOTH in one go.
    // We only do this when explicitly opted in via body.one_click=true.
    const sibling =
      platform === 'gmail' ? 'google_drive' : platform === 'google_drive' ? 'gmail' : null;
    if (body.one_click && sibling) {
      const { data: sibRow } = await admin
        .from('social_connections')
        .select('id, credentials, display_name')
        .eq('platform', sibling)
        .eq('created_by', callerUserId)
        .maybeSingle();

      const sibPrev = (sibRow?.credentials as Record<string, unknown> | null) ?? {};
      const sibPrevManual = ((sibPrev as any).manual ?? {}) as Record<string, string>;

      const sibCreds = {
        ...sibPrev,
        account_name: identity.account_name,
        verified_identity: identity,
        connection_status: 'CONNECTED',
        manual: {
          ...sibPrevManual,
          access_token: tokens.access_token,
          ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
          token_scope: tokens.scope ?? sibPrevManual.token_scope ?? '',
          google_sync_source: 'shared',
          // Mirror the same client credentials so future verifications work too.
          oauth_client_id: clientId!,
          oauth_client_secret: clientSecret!,
        },
      };

      const sibUpd = {
        platform: sibling,
        created_by: callerUserId,
        display_name:
          sibRow?.display_name ??
          (sibling === 'gmail' ? 'Gmail · Google Workspace' : 'Google Drive'),
        credentials: sibCreds,
        encrypted_session: sessionMarker,
        session_method: 'oauth' as const,
        is_connected: true,
        connected_at: new Date().toISOString(),
        last_test_at: new Date().toISOString(),
        last_test_status: 'ok',
        last_test_message: `Linked via One-Click (${platform})`,
      };

      if (sibRow?.id) {
        await admin.from('social_connections').update(sibUpd).eq('id', sibRow.id);
      } else {
        await admin.from('social_connections').insert(sibUpd);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        identity,
        credential_source: credentialSource,
        sibling_synced: !!(body.one_click && sibling),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err: any) {
    console.error('google-oauth-exchange error', err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

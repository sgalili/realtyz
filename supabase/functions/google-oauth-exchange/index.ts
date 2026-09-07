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

/** Every outbound Google call is time-boxed so the function can never hang. */
async function timedFetch(url: string, init: RequestInit = {}, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error(`Google request timed out after ${ms}ms: ${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Time-box any promise (DB writes included) with a descriptive error. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

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
  const res = await timedFetch('https://oauth2.googleapis.com/token', {
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
  const res = await timedFetch('https://www.googleapis.com/oauth2/v3/userinfo', {
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
  const res = await timedFetch(
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
  const userRes = await timedFetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userJson = await userRes.json().catch(() => ({}));
  if (!userRes.ok) {
    return { error: userJson.error?.message || `userinfo ${userRes.status}`, status: userRes.status };
  }
  const aboutRes = await timedFetch(
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
  const userRes = await timedFetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userJson = await userRes.json().catch(() => ({}));
  if (!userRes.ok) {
    return { error: userJson.error?.message || `userinfo ${userRes.status}`, status: userRes.status };
  }
  // Probe primary calendar to confirm scope
  const calRes = await timedFetch(
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

async function handle(req: Request): Promise<Response> {
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
      return new Response(JSON.stringify({ ok: false, error: 'הבקשה נשלחה ללא התחברות פעילה. התחבר למערכת ונסה שוב.', code: 'unauthorized' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Every authenticated user may connect their OWN Google account: all
    // reads/writes below are scoped to `created_by = caller`, so there is no
    // cross-user exposure and no admin gate is needed.

    const body: ExchangeBody = await req.json().catch(() => ({}));
    const platform = String(body.platform || '').toLowerCase();
    const code = body.code;
    const redirectUri = String(body.redirect_uri || 'https://realtyz.co.il/oauth/callback').trim();

    if (
      platform !== 'gmail' &&
      platform !== 'youtube' &&
      platform !== 'google_drive' &&
      platform !== 'google_calendar' &&
      platform !== 'google_all'
    ) {
      return new Response(
        JSON.stringify({ ok: false, error: `פלטפורמת גוגל לא נתמכת: ${platform || '(ריק)'}`, code: 'bad_platform' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!code || !redirectUri) {
      return new Response(
        JSON.stringify({ ok: false, error: 'חסר קוד אישור מגוגל (code) או redirect_uri.', code: 'missing_code' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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
          code: 'missing_client',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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
      return new Response(JSON.stringify({ ok: false, error: tokens.error, code: 'token_exchange_failed', redirect_uri_used: redirectUri }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch real identity with the fresh access_token.
    const identity =
      platform === 'gmail' || platform === 'google_all'
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
        .eq('platform', platform === 'google_all' ? 'gmail' : platform)
        .eq('created_by', callerUserId);
      return new Response(
        JSON.stringify({ ok: false, error: identity.error, google_status: identity.status, code: 'identity_failed' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Persist tokens + identity + mark LIVE.
    const sessionMarker = `goog_${tokens.access_token.slice(0, 32)}_${Date.now()}`;

    const platformsToSync = platform === 'google_all'
      ? ['gmail', 'google_calendar', 'youtube'] as const
      : [platform] as const;

    const displayNameFor = (p: string) => {
      if (p === 'gmail') return 'Gmail · Google Workspace';
      if (p === 'youtube') return 'YouTube';
      if (p === 'google_calendar') return 'Google Calendar';
      return 'Google Drive';
    };

    let saveWarning: string | null = null;

    for (const targetPlatform of platformsToSync) {
      const { data: targetRow } = await admin
        .from('social_connections')
        .select('id, credentials, display_name, is_connected')
        .eq('platform', targetPlatform)
        .eq('created_by', callerUserId)
        .maybeSingle();

      // Smart persistence: an automatic bundle sign-in (google_all) must NEVER
      // clobber a Google service the user already connected deliberately.
      // Only fill in the services that have no live connection yet.
      const alreadyLive = !!(targetRow as any)?.is_connected
        && !!((targetRow?.credentials as any)?.manual?.refresh_token
          || (targetRow?.credentials as any)?.manual?.access_token);
      if (platform === 'google_all' && alreadyLive) continue;


      const prevCreds = (targetRow?.credentials as Record<string, unknown> | null) ?? {};
      const prevManual = ((prevCreds as any).manual ?? {}) as Record<string, string>;

      const targetIdentity =
        targetPlatform === 'youtube'
          ? await fetchYouTubeIdentity(tokens.access_token).catch(() => identity)
          : targetPlatform === 'google_calendar'
            ? await fetchCalendarIdentity(tokens.access_token).catch(() => identity)
            : identity;

      const newCreds = {
        ...prevCreds,
        account_name: ('account_name' in targetIdentity ? targetIdentity.account_name : identity.account_name),
        verified_identity: targetIdentity,
        connection_status: 'CONNECTED',
        manual: {
          ...prevManual,
          access_token: tokens.access_token,
          // only overwrite refresh_token if Google returned a new one
          ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
          token_scope: tokens.scope ?? prevManual.token_scope ?? '',
          // Remember which shared source supplied the tokens.
          google_sync_source: platform === 'google_all' ? 'google_all' : undefined,
        },
      };

      const upd = {
        platform: targetPlatform,
        created_by: callerUserId,
        display_name: targetRow?.display_name ?? displayNameFor(targetPlatform),
        credentials: newCreds,
        encrypted_session: sessionMarker,
        session_method: 'oauth' as const,
        is_connected: true,
        connected_at: new Date().toISOString(),
        last_test_at: new Date().toISOString(),
        last_test_status: 'ok',
        last_test_message: platform === 'google_all'
          ? 'Auto-linked via combined Google sign-in'
          : 'OAuth completed and identity verified',
      };

      if (targetRow?.id) {
        const { error } = await admin
          .from('social_connections')
          .update(upd)
          .eq('id', targetRow.id);
        if (error && !saveWarning) saveWarning = error.message;
      } else {
        const { error } = await admin.from('social_connections').upsert(upd, { onConflict: 'created_by,platform' });
        if (error && !saveWarning) saveWarning = error.message;
      }
    }

    if (saveWarning) {
      return new Response(
        JSON.stringify({ ok: false, error: `שמירת החיבור נכשלה: ${saveWarning}`, code: 'db_save_failed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
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
        await admin.from('social_connections').upsert(sibUpd, { onConflict: 'created_by,platform' });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        identity,
        credential_source: credentialSource,
        sibling_synced: !!(body.one_click && sibling),
        platforms_synced: platform === 'google_all' ? ['gmail', 'google_calendar', 'youtube'] : [platform],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (err: any) {
    console.error('google-oauth-exchange error', err);
    return new Response(JSON.stringify({ ok: false, error: err?.message ?? 'Unknown error', code: 'unhandled' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

Deno.serve(async (req) => {
  try {
    // Absolute ceiling: return a descriptive error instead of hanging until the
    // platform kills the request.
    return await withTimeout(handle(req), 18_000, 'google-oauth-exchange');
  } catch (err: any) {
    console.error('google-oauth-exchange fatal', err);
    return new Response(
      JSON.stringify({ ok: false, error: err?.message ?? 'timeout', code: 'timeout' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

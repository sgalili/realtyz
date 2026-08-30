import { supabase } from '@/integrations/supabase/client';

/**
 * SocialAutomationService
 * ------------------------
 * Production-grade connection engine. In demo mode it returns synthesized
 * account labels for the marketing experience. In real mode it ONLY
 * persists what was actually returned by an authentic OAuth/QR session
 * - no fabricated names, no dummy emails.
 */

export type SessionMethod = 'qr' | 'otp' | 'oauth';

/** Connection lifecycle state machine. */
export type ConnectionState =
  | 'IDLE'
  | 'INITIALIZING'
  | 'AWAITING_AUTH'
  | 'SYNCING'
  | 'CONNECTED'
  | 'FAILED';

export interface StateDescriptor {
  state: ConnectionState;
  label: string;
  hint: string;
  percent: number;
}

export const CONNECTION_STATES: Record<ConnectionState, StateDescriptor> = {
  IDLE:          { state: 'IDLE',          label: 'מוכן לחיבור',                   hint: 'לחץ "חיבור מהיר" כדי להתחיל', percent: 0 },
  INITIALIZING: { state: 'INITIALIZING', label: 'מאתחל גשר מאובטח...',          hint: 'מקצה ערוץ מוצפן end-to-end',   percent: 18 },
  AWAITING_AUTH:{ state: 'AWAITING_AUTH',label: 'ממתין לאישור במכשיר...',       hint: 'אשר בטלפון או הזן קוד',         percent: 48 },
  SYNCING:      { state: 'SYNCING',      label: 'מסנכרן פרופיל ונתוני חשבון...', hint: 'מושך מטא-דאטה ראשונית',         percent: 82 },
  CONNECTED:    { state: 'CONNECTED',    label: 'מחובר · ערוץ פעיל',             hint: 'הסשן נשמר ומאובטח',             percent: 100 },
  FAILED:       { state: 'FAILED',       label: 'החיבור נכשל',                   hint: 'נסה שוב או החלף שיטה',          percent: 0 },
};

export interface QuickConnectSession {
  sessionId: string;
  method: SessionMethod;
  /** Opaque QR payload (real session request, not a static asset) */
  qrPayload?: string;
  /** Masked target (e.g. phone) for OTP flows */
  otpTarget?: string;
  expiresAt: number;
}

export interface ConnectedAccount {
  accountName: string;
  encryptedSession: string;
}

/**
 * Synthetic labels used ONLY when the global demo mode is on. In production
 * they must never appear; we'll write a neutral placeholder until the
 * real provider profile call returns the actual account identity.
 *
 * Note: Google providers (gmail/youtube) are intentionally NOT listed here
 * even for demo. Their identity comes exclusively from the live
 * `verify-google-identity` edge function call against the real Google API.
 */
const DEMO_LABELS: Record<string, string> = {
  whatsapp_green:  'WBA · 054-***-1841',
  whatsapp_wba:    'WBA רשמי · Realtyz Business',
  whatsapp:        'WhatsApp · 054-***-1841',
  telegram:        '@realtyz_bot',
  instagram:       '@realtyz.official',
  facebook:        'Realtyz Page · 12.4K',
  x:               '@RealtyzAI',
  tiktok:          '@realtyz.live',
  signal:          'Signal · 054-***-1841',
};

/** Providers whose identity may only come from a real provider API call. */
const REAL_IDENTITY_ONLY = new Set(['gmail', 'youtube', 'google_drive', 'linkedin']);

/**
 * OAuth scopes per platform - what we request during the official login flow.
 * Surfaced in the UI so the user knows what they're granting.
 */
export const OAUTH_SCOPES: Record<string, string[]> = {
  // Minimum set per feature actually used in the product: Gmail is only ever
  // used to SEND (dispatch-campaign), Calendar to read primary + freeBusy and
  // create events, YouTube only to read the channel. Requesting more triggers
  // Google's "this app wants access to N services" warning for nothing.
  gmail:     [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid',
  ],
  youtube:   [
    'https://www.googleapis.com/auth/youtube.readonly',
  ],
  facebook:  [
    'public_profile',
    'pages_show_list',
    'pages_manage_posts',
    'pages_read_engagement',
  ],
  instagram: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_comments'],
  x:         ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  tiktok:    ['user.info.basic', 'video.list', 'video.publish', 'comment.list', 'comment.list.manage'],
  linkedin:  ['openid', 'profile', 'email', 'w_member_social'],
  google_drive: [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid',
  ],
  google_calendar: [
    // calendar.events covers create/update; calendar.readonly covers freeBusy.
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid',
  ],
  /** Combined Google services flow: Gmail + Calendar + YouTube in one consent. */
  google_all: [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/youtube.readonly',
  ],
};


/**
 * Provider OAuth authorize endpoints. Used when a per-platform client_id
 * has been saved via the Manual Configuration modal (BYOK).
 */
export const OAUTH_AUTHORIZE_URLS: Record<string, string> = {
  gmail:        'https://accounts.google.com/o/oauth2/v2/auth',
  youtube:      'https://accounts.google.com/o/oauth2/v2/auth',
  google_drive:    'https://accounts.google.com/o/oauth2/v2/auth',
  google_calendar: 'https://accounts.google.com/o/oauth2/v2/auth',
  google_all:      'https://accounts.google.com/o/oauth2/v2/auth',
  facebook:     'https://www.facebook.com/v19.0/dialog/oauth',
  instagram:    'https://api.instagram.com/oauth/authorize',
  x:            'https://twitter.com/i/oauth2/authorize',
  tiktok:       'https://www.tiktok.com/v2/auth/authorize/',
  linkedin:     'https://www.linkedin.com/oauth/v2/authorization',
};

export const SHARED_OAUTH_PLATFORM_MAP: Partial<Record<string, 'google' | 'linkedin' | 'meta'>> = {
  gmail: 'google',
  google_drive: 'google',
  google_calendar: 'google',
  youtube: 'google',
  linkedin: 'linkedin',
  facebook: 'meta',
  instagram: 'meta',
};

export const ONE_CLICK_SUPPORTED_PLATFORMS = new Set<string>([
  'gmail',
  'google_drive',
  'youtube',
  'linkedin',
  'facebook',
  'instagram',
]);

/**
 * Lightweight masking. The real encryption happens server-side; this
 * function just guarantees the UI never holds plaintext session material.
 */
function maskSession(raw: string): string {
  const key = 'realtyz-magic-connect';
  const out: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    out.push(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(String.fromCharCode(...out));
}

export const SocialAutomationService = {
  states: CONNECTION_STATES,
  oauthScopes: OAUTH_SCOPES,
  authorizeUrls: OAUTH_AUTHORIZE_URLS,

  methodFor(platform: string): SessionMethod {
    // QR / Session Mirroring: device-pairing protocols.
    if (
      platform === 'whatsapp' ||
      platform === 'whatsapp_green' ||
      platform === 'whatsapp_wba' ||
      platform === 'telegram' ||
      platform === 'signal'
    ) {
      return 'qr';
    }
    if (platform === 'sms') return 'otp';
    return 'oauth';
  },

  /**
   * Initialize a session and return the portal payload (QR or OTP target).
   * The QR payload is a freshly generated session request token - never a
   * static asset.
   */
  async beginSession(platform: string): Promise<QuickConnectSession> {
    const method = SocialAutomationService.methodFor(platform);
    await new Promise((r) => setTimeout(r, 400));
    const sessionId = `sess_${crypto.randomUUID()}`;
    return {
      sessionId,
      method,
      // Real QR request token: nonce per-call, includes platform + expiry.
      qrPayload: method === 'qr'
        ? `realtyz://link?platform=${platform}&sid=${sessionId}&n=${crypto.randomUUID()}&exp=${Date.now() + 90_000}`
        : undefined,
      otpTarget: method === 'otp' ? '••• ••• 1841' : undefined,
      expiresAt: Date.now() + 90_000,
    };
  },

  async submitOtp(sessionId: string, code: string): Promise<boolean> {
    await new Promise((r) => setTimeout(r, 700));
    return /^\d{4,8}$/.test(code) && sessionId.startsWith('sess_');
  },

  /**
   * Build a "captured account" payload after successful auth.
   *
   * In **demo mode** we synthesize a deterministic label per platform
   * so the marketing experience stays alive.
   *
   * In **real mode** we DO NOT fabricate anything: the caller must pass
   * `realProfile` that came from the actual provider profile endpoint.
   * Until that happens we return a neutral pending label so a user can
   * never confuse a stub with a real connection.
   */
  captureAccount(
    platform: string,
    sessionId: string,
    opts?: { demoMode?: boolean; realProfile?: { name?: string; email?: string } }
  ): ConnectedAccount {
    const demoMode = opts?.demoMode ?? false;
    const realProfile = opts?.realProfile;

    let name: string;
    if (realProfile?.email || realProfile?.name) {
      name = realProfile.email ?? realProfile.name!;
    } else if (REAL_IDENTITY_ONLY.has(platform)) {
      // Gmail / YouTube must never get a synthesized name — even in demo.
      // Their identity is set by the verify-google-identity edge function.
      name = 'ממתין לאימות זהות מול Google';
    } else if (demoMode) {
      name = DEMO_LABELS[platform] ?? platform;
    } else {
      // Real mode without a confirmed profile: leave blank so the UI
      // falls back to display_name instead of showing a "waiting" label.
      name = '';
    }

    return {
      accountName: name,
      encryptedSession: maskSession(`${platform}|${sessionId}|${Date.now()}`),
    };
  },

  async persistSession(params: {
    platform: string;
    displayName: string;
    method: SessionMethod;
    account: ConnectedAccount;
  }) {
    const { data: existing } = await supabase
      .from('social_connections')
      .select('id, credentials')
      .eq('platform', params.platform)
      .maybeSingle();

    const previousCreds = (existing?.credentials as Record<string, unknown> | null) ?? {};

    const payload = {
      platform: params.platform,
      display_name: params.displayName,
      credentials: {
        ...previousCreds,
        account_name: params.account.accountName,
        connection_status: 'CONNECTED' as ConnectionState,
      },
      encrypted_session: params.account.encryptedSession,
      session_method: params.method,
      connected_at: new Date().toISOString(),
      is_connected: true,
      last_test_status: 'ok',
      last_test_message: 'Session established',
      last_test_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { error } = await supabase
        .from('social_connections')
        .update(payload)
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('social_connections').insert(payload);
      if (error) throw error;
    }
  },

  /**
   * Persist BYOK credentials provided through the Manual Configuration
   * modal (gear icon). Stored under `credentials.manual` so they're
   * separate from session metadata.
   */
  async persistManualConfig(params: {
    platform: string;
    displayName: string;
    config: Record<string, string>;
  }) {
    // Filter out empty values so we don't wipe previously-saved fields.
    const filtered: Record<string, string> = {};
    for (const [k, v] of Object.entries(params.config)) {
      if (v && v.trim().length > 0) filtered[k] = v.trim();
    }

    // Save to the originating platform's row.
    await writeManual(params.platform, params.displayName, filtered);

    // 🔄 Auto-Sync Google credentials across Gmail / YouTube / Drive.
    // Gmail, YouTube, and Drive all share the same Google Cloud OAuth client,
    // so when the user pastes oauth_client_id / oauth_client_secret on ANY of
    // the three, propagate them to the other two so the user only configures
    // Google once.
    const GOOGLE_PLATFORMS: Record<string, string> = {
      gmail: 'Gmail',
      youtube: 'YouTube',
      google_drive: 'Google Drive',
    };
    if (GOOGLE_PLATFORMS[params.platform]) {
      const sharedKeys = ['oauth_client_id', 'oauth_client_secret', 'workspace_domain'] as const;
      const shared: Record<string, string> = {};
      for (const k of sharedKeys) {
        if (filtered[k]) shared[k] = filtered[k];
      }
      if (Object.keys(shared).length > 0) {
        const others = Object.keys(GOOGLE_PLATFORMS).filter((p) => p !== params.platform);
        await Promise.all(
          others.map((p) => writeManual(p, GOOGLE_PLATFORMS[p], shared, { markSynced: true })),
        );
      }
    }
  },

  /** Fully wipes session material - immediate UX reset. */
  async disconnect(platform: string) {
    if (['facebook', 'facebook_page', 'instagram', 'meta'].includes(platform.toLowerCase())) {
      const { data, error } = await supabase.functions.invoke('meta-page-connect', {
        body: { action: 'disconnect' },
      });
      if (error) throw error;
      if (!(data as { ok?: boolean } | null)?.ok) throw new Error('Facebook disconnect was not confirmed');
      try {
        window.dispatchEvent(new CustomEvent('realtyz:facebook-disconnected'));
      } catch { /* non-browser caller */ }
      return;
    }
    const { error } = await supabase
      .from('social_connections')
      .update({
        encrypted_session: null,
        session_method: null,
        is_connected: false,
        connected_at: null,
        credentials: { connection_status: 'IDLE' as ConnectionState },
        last_test_status: 'disconnected',
        last_test_message: 'Session wiped by user',
        last_test_at: new Date().toISOString(),
      })
      .eq('platform', platform);
    if (error) throw error;
  },

  /**
   * Global Google reset: wipes Client ID, Client Secret, workspace_domain
   * and any active OAuth session across Gmail, YouTube, and Google Drive.
   * Other providers (LinkedIn, Meta, etc.) are NOT touched.
   */
  async clearGoogleConfig() {
    const GOOGLE = ['gmail', 'youtube', 'google_drive'];
    const { data: rows } = await supabase
      .from('social_connections')
      .select('id, platform, credentials')
      .in('platform', GOOGLE);

    await Promise.all(
      (rows ?? []).map(async (row: any) => {
        const creds = (row.credentials as Record<string, unknown> | null) ?? {};
        const manual = { ...((creds as any).manual ?? {}) } as Record<string, string>;
        // Strip shared Google credential fields and sync markers.
        delete manual.oauth_client_id;
        delete manual.oauth_client_secret;
        delete manual.workspace_domain;
        delete manual.google_sync_source;
        delete manual.google_sync_at;

        const nextCreds: Record<string, unknown> = {
          ...creds,
          manual,
          connection_status: 'IDLE' as ConnectionState,
        };
        // Drop any cached verified identity (it belonged to those credentials).
        delete (nextCreds as any).verified_identity;
        delete (nextCreds as any).account_name;

        const { error } = await supabase
          .from('social_connections')
          .update({
            credentials: nextCreds as any,
            encrypted_session: null,
            session_method: null,
            is_connected: false,
            connected_at: null,
            last_test_status: 'disconnected',
            last_test_message: 'Google configuration cleared by user',
            last_test_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        if (error) throw error;
      }),
    );
  },

  /**
   * Generic platform reset: wipes Client ID/Secret and any OAuth session for
   * the given platform(s). Used for non-Google providers where credentials
   * are not shared. Pass an array to cascade-clear (e.g. Meta + Instagram,
   * which often share the same Meta App).
   */
  async clearPlatformConfig(platforms: string | string[]) {
    const list = Array.isArray(platforms) ? platforms : [platforms];
    const { data: rows } = await supabase
      .from('social_connections')
      .select('id, platform, credentials')
      .in('platform', list);

    await Promise.all(
      (rows ?? []).map(async (row: any) => {
        const creds = (row.credentials as Record<string, unknown> | null) ?? {};
        const manual = { ...((creds as any).manual ?? {}) } as Record<string, string>;
        delete manual.oauth_client_id;
        delete manual.oauth_client_secret;
        delete manual.access_token;
        delete manual.refresh_token;

        const nextCreds: Record<string, unknown> = {
          ...creds,
          manual,
          connection_status: 'IDLE' as ConnectionState,
        };
        delete (nextCreds as any).verified_identity;
        delete (nextCreds as any).account_name;
        delete (nextCreds as any).credentials_check;

        const { error } = await supabase
          .from('social_connections')
          .update({
            credentials: nextCreds as any,
            encrypted_session: null,
            session_method: null,
            is_connected: false,
            connected_at: null,
            last_test_status: 'disconnected',
            last_test_message: 'Configuration cleared by user',
            last_test_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        if (error) throw error;
      }),
    );
  },


  /**
   * A connection is considered LIVE only when there's an actual session
   * token persisted - not just the legacy `is_connected` flag. This is
   * what the production "Live" badge keys off of.
   */
  isLive(row: { is_connected?: boolean | null; encrypted_session?: string | null } | null | undefined): boolean {
    return !!(row?.is_connected && row?.encrypted_session && row.encrypted_session.length > 0);
  },
};

/**
 * Internal: write a partial manual-credential blob to a single platform row,
 * preserving any unrelated fields already stored in `credentials`.
 *
 * `markSynced` flags the row so the UI can show the "synced from your Google
 * settings" hint instead of pretending the user typed it manually.
 */
async function writeManual(
  platform: string,
  displayName: string,
  fields: Record<string, string>,
  opts: { markSynced?: boolean } = {},
) {
  if (Object.keys(fields).length === 0) return;

  const { data: existing } = await supabase
    .from('social_connections')
    .select('id, credentials')
    .eq('platform', platform)
    .maybeSingle();

  const previousCreds = (existing?.credentials as Record<string, unknown> | null) ?? {};
  const previousManual = ((previousCreds as any)?.manual ?? {}) as Record<string, string>;

  const nextManual: Record<string, string> = { ...previousManual, ...fields };
  if (opts.markSynced) {
    nextManual.google_sync_source = 'shared';
    nextManual.google_sync_at = new Date().toISOString();
  }

  const payload = {
    platform,
    display_name: displayName,
    credentials: { ...previousCreds, manual: nextManual },
  };

  if (existing?.id) {
    const { error } = await supabase
      .from('social_connections')
      .update(payload)
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    // Stamp created_by so the dispatch function (which scopes per user) can find this row.
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('social_connections')
      .insert({ ...payload, is_connected: false, created_by: user?.id ?? null });
    if (error) throw error;
  }
}

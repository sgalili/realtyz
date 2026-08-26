import { useEffect, useMemo, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BrandLogo } from './BrandLogo';
import { QuickConnectModal } from './QuickConnectModal';
import { ManualConfigModal } from './ManualConfigModal';
import { SharedOAuthAppsCard } from './SharedOAuthAppsCard';
import {
  SocialAutomationService,
  OAUTH_SCOPES,
  OAUTH_AUTHORIZE_URLS,
  type SessionMethod,
} from '@/lib/socialAutomationService';
import {
  Activity,
  CheckCircle2,
  Loader2,
  QrCode,
  ShieldCheck,
  Unlink,
  AlertTriangle,
  Lock,
  Settings,
  KeyRound,
} from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { useDemoMode } from '@/hooks/useDemoMode';
import { toast } from 'sonner';
import { oauthRedirectUri, oauthReturnOrigin } from '@/lib/oauthRedirect';

interface PlatformDef {
  platform: string;
  display_name: string;
  description: string;
  ownerOnly?: boolean;
}

const PLATFORMS: PlatformDef[] = [
  // Priority order: WhatsApp first, then Google suite, then major social
  { platform: 'whatsapp_green', display_name: 'WhatsApp (WBA)',           description: 'WBA · סינכרון מכשיר באמצעות סריקת QR' },
  { platform: 'gmail',        display_name: 'Gmail',                   description: 'OAuth2 רשמי · שליחת מיילים מהדומיין' },
  { platform: 'google_drive', display_name: 'Google Drive',             description: 'ייבוא קבצי CSV/Excel ומדיה מהענן' },
  { platform: 'facebook',     display_name: 'Facebook',                 description: 'OAuth2 רשמי · עמוד ומסנג׳ר' },
  { platform: 'instagram',    display_name: 'Instagram Business',       description: 'תזמון פוסטים, ריילז וסטוריז שנוצרו ב-AI ישירות מעמוד הקמפיין.' },
  { platform: 'tiktok',       display_name: 'TikTok for Business',      description: 'העלאה ותזמון של סרטונים קצרים, ניטור תגובות ומעקב טרנדים.' },
  { platform: 'telegram',     display_name: 'Telegram',                 description: 'זיווג מכשיר מהיר באמצעות QR' },
  { platform: 'linkedin',     display_name: 'LinkedIn Profile',         description: 'פרסום עדכוני AI ואינטראקציה עם מתעניינים' },
  // The rest
  { platform: 'youtube',      display_name: 'YouTube',                  description: 'OAuth2 רשמי · ניהול תגובות וערוץ' },
  { platform: 'x',            display_name: 'X (Twitter)',              description: 'OAuth2 רשמי · ציוצים ותגובות' },
  { platform: 'signal',       display_name: 'Signal',                   description: 'מראה מכשיר מאובטח באמצעות QR' },
];

/**
 * Production OAuth callback URI (registered in Google Cloud Console).
 * The published app and any preview MUST forward Google back to this exact
 * string when running on the production custom domain. For local/preview
 * environments we fall back to the current origin (which the developer is
 * expected to also register in Google Cloud Console).
 */
const PROD_OAUTH_CALLBACK = 'https://ai.realtyz.co.il/oauth/callback';
const getOAuthRedirectUri = (): string => {
  if (typeof window === 'undefined') return PROD_OAUTH_CALLBACK;
  const host = window.location.hostname;
  // Force production URI on the live custom domain + lovable.app published host.
  if (host === 'ai.realtyz.co.il' || host === 'realtyzai.lovable.app') {
    return PROD_OAUTH_CALLBACK;
  }
  // Preview / local: use current origin so devs can register their own URI.
  return `${window.location.origin}/oauth/callback`;
};

// Map a card's platform key to one or more values that may appear in
// interaction_activity_log.platform (which uses canonical short names).
const ACTIVITY_KEYS: Record<string, string[]> = {
  gmail:          ['gmail', 'email'],
  google_drive:   ['google_drive', 'drive'],
  youtube:        ['youtube'],
  linkedin:       ['linkedin'],
  facebook:       ['facebook', 'messenger'],
  instagram:      ['instagram'],
  x:              ['x', 'twitter'],
  tiktok:         ['tiktok'],
  whatsapp_green: ['whatsapp', 'whatsapp_green'],
  telegram:       ['telegram'],
  signal:         ['signal'],
};

const METHOD_BADGE: Record<SessionMethod, { label: string; cls: string; icon: typeof QrCode }> = {
  oauth: { label: 'OAuth2 רשמי',  cls: 'bg-primary/10 text-primary border-primary/30',           icon: ShieldCheck },
  qr:    { label: 'QR · Mirror',  cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: QrCode },
  otp:   { label: 'OTP',          cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30',     icon: Lock },
};

export function SocialConnectionsTab() {
  const { isSuperAdmin } = useUserRole();
  const { isDemoMode } = useDemoMode();
  const queryClient = useQueryClient();
  const [active, setActive] = useState<PlatformDef | null>(null);
  const [configFor, setConfigFor] = useState<PlatformDef | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Deep-link support: /social-connect?connect=<platform>&returnTo=<url>
  // Auto-opens the manual configuration dialog for the requested platform,
  // and after a successful connect (or dialog close) bounces the user back to
  // returnTo with ?connected=<platform> appended so the origin page can react.
  const navigate = useNavigate();
  const location = useLocation();
  const returnToRef = useRef<string | null>(null);
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    const sp = new URLSearchParams(location.search);
    const connectKey = sp.get('connect');
    const returnTo = sp.get('returnTo');
    if (!connectKey) return;
    const def = PLATFORMS.find((p) => p.platform === connectKey);
    if (!def) return;
    autoOpenedRef.current = true;
    returnToRef.current = returnTo;
    setConfigFor(def);
    // Strip query params so a refresh doesn't re-open the dialog
    const cleaned = new URLSearchParams(location.search);
    cleaned.delete('connect');
    cleaned.delete('returnTo');
    navigate(
      { pathname: location.pathname, search: cleaned.toString() ? `?${cleaned.toString()}` : '' },
      { replace: true }
    );
  }, [location.search, location.pathname, navigate]);

  // Called when the modal closes after a save — if a returnTo was set,
  // navigate back, appending ?connected=<platform> so the origin page can
  // refresh its connection map and toast the user.
  const honorReturnTo = (platform: string, success: boolean) => {
    const target = returnToRef.current;
    if (!target) return;
    returnToRef.current = null;
    const sep = target.includes('?') ? '&' : '?';
    const url = success ? `${target}${sep}connected=${encodeURIComponent(platform)}` : target;
    navigate(url);
  };

  const { data: connections, refetch, isLoading } = useQuery({
    queryKey: ['social-connections'],
    queryFn: async () => {
      const { data, error } = await supabase.from('social_connections').select('*');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Per-platform activity count over the last 24h. Pulled from the
  // interaction_activity_log table and refreshed live via Realtime below.
  const { data: activity24h } = useQuery({
    queryKey: ['social-activity-24h'],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('interaction_activity_log')
        .select('platform')
        .gte('created_at', since);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((row: { platform: string | null }) => {
        const key = (row.platform ?? '').toLowerCase();
        if (!key) return;
        counts[key] = (counts[key] ?? 0) + 1;
      });
      return counts;
    },
    refetchInterval: 60_000, // safety net in case realtime drops
  });

  // Realtime subscription: any new activity row instantly bumps counters.
  useEffect(() => {
    const channel = supabase
      .channel('social-activity-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'interaction_activity_log' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['social-activity-24h'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'social_connections' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['social-connections'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const byPlatform = useMemo(() => {
    const m = new Map<string, any>();
    (connections ?? []).forEach((c) => m.set(c.platform, c));
    return m;
  }, [connections]);

  const activityFor = (platformKey: string): number => {
    const keys = ACTIVITY_KEYS[platformKey] ?? [platformKey];
    return keys.reduce((sum, k) => sum + ((activity24h ?? {})[k] ?? 0), 0);
  };

  const visiblePlatforms = useMemo(() => {
    const list = PLATFORMS.filter((p) => !p.ownerOnly || isSuperAdmin);
    // Connected cards float to the top, disconnected stay in original order below.
    return [...list].sort((a, b) => {
      const aLive = SocialAutomationService.isLive(byPlatform.get(a.platform)) ? 1 : 0;
      const bLive = SocialAutomationService.isLive(byPlatform.get(b.platform)) ? 1 : 0;
      return bLive - aLive;
    });
  }, [isSuperAdmin, byPlatform]);
  // Live = real session token persisted (not just is_connected flag).
  const connectedCount = visiblePlatforms.filter((p) => SocialAutomationService.isLive(byPlatform.get(p.platform))).length;
  const totalCount = visiblePlatforms.length;
  const hasIssues = (connections ?? []).some(
    (c) => c.is_connected && c.last_test_status && c.last_test_status !== 'ok'
  );

  const totalActivity24h = visiblePlatforms.reduce((sum, p) => sum + activityFor(p.platform), 0);
  const activitySuffix = totalActivity24h > 0 ? ` · ${totalActivity24h} פעולות ב־24 שעות אחרונות` : '';

  const banner = hasIssues
    ? { tone: 'warn' as const, title: 'נדרש סינכרון מחדש', sub: `${connectedCount} מתוך ${totalCount} ערוצים פעילים · אחד או יותר דורש אימות מחדש${activitySuffix}` }
    : connectedCount === 0
      ? { tone: 'idle' as const, title: 'אין חיבורים פעילים', sub: 'התחבר לערוץ הראשון כדי להפעיל את האוטומציה' }
      : { tone: 'ok' as const, title: 'כל המערכות פעילות', sub: `${connectedCount} מתוך ${totalCount} ערוצים מסונכרנים · live sync פועל${activitySuffix}` };

  /**
   * Real OAuth: open the provider's authorize URL in a popup if BYOK
   * client_id is configured. Otherwise prompt to set it via the gear.
   */
  const launchRealOAuth = (def: PlatformDef): boolean => {
    const conn = byPlatform.get(def.platform);
    const manual = (conn?.credentials?.manual ?? {}) as Record<string, string>;
    const clientId = manual.oauth_client_id?.trim();
    const clientSecret = manual.oauth_client_secret?.trim();
    const authorize = OAUTH_AUTHORIZE_URLS[def.platform];
    if (!authorize) return false;

    const isGoogle = def.platform === 'gmail' || def.platform === 'youtube' || def.platform === 'google_drive';

    if (!clientId) {
      return false;
    }
    // Google requires the secret too — without it the callback exchange fails with invalid_client.
    if (isGoogle && !clientSecret) {
      return false;
    }

    const redirect = getOAuthRedirectUri();
    const scope = (OAUTH_SCOPES[def.platform] ?? []).join(' ');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope,
      access_type: 'offline',
      prompt: 'select_account consent',
      include_granted_scopes: 'true',
      state: `${def.platform}:${crypto.randomUUID()}`,
    });
    if (def.platform === 'gmail' && manual.workspace_domain) {
      params.set('hd', manual.workspace_domain);
    }
    const url = `${authorize}?${params.toString()}`;
    const w = 520, h = 640;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(url, 'realtyz-oauth', `width=${w},height=${h},left=${left},top=${top}`);
    if (!popup) {
      toast.error('הדפדפן חסם את חלון ההתחברות', {
        description: 'אפשר חלונות קופצים עבור האתר ונסה שוב.',
      });
      return false;
    }
    toast.message('נפתח חלון התחברות רשמי', {
      description: `${def.display_name} · OAuth2 · ${OAUTH_SCOPES[def.platform]?.length ?? 0} scopes · redirect: ${redirect}`,
    });
    return true;
  };

  /**
   * Listen for the popup callback. The popup at /oauth/callback posts back
   * { type: 'realtyz-oauth-callback', code, state, error }.
   * We then call the edge function that exchanges the code → tokens →
   * fetches the real Google identity → marks the card LIVE.
   */
  useEffect(() => {
    const handler = async (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const data = ev.data;
      if (!data || data.type !== 'realtyz-oauth-callback') return;

      const state = String(data.state ?? '');
      const stateParts = state.split(':');
      const platform = stateParts[0];
      const isOneClick = stateParts[1] === 'oneclick';
      if (!platform) return;

      if (data.error) {
        toast.error('האימות בוטל', { description: data.errorDescription || data.error });
        return;
      }
      if (!data.code) {
        toast.error('Google לא החזיר קוד אימות');
        return;
      }

      // Route to the appropriate exchange function per provider family.
      const isGoogleFamily = platform === 'gmail' || platform === 'youtube' || platform === 'google_drive';
      const isLinkedIn = platform === 'linkedin';
      if (!isGoogleFamily && !isLinkedIn) return;

      const toastId = toast.loading('מחליף קוד אימות בטוקן...', {
        description: isLinkedIn ? 'מאמת זהות מול LinkedIn' : 'מאמת זהות מול Google',
      });
      try {
        const redirectUri = getOAuthRedirectUri();
        const fnName = isLinkedIn ? 'linkedin-oauth-exchange' : 'google-oauth-exchange';
        const { data: resp, error } = await supabase.functions.invoke(
          fnName,
          {
            body: {
              platform,
              code: data.code,
              redirect_uri: redirectUri,
              ...(isGoogleFamily && isOneClick ? { one_click: true } : {}),
            },
          },
        );
        if (error) throw error;
        if (!resp?.ok) throw new Error(resp?.error || 'Exchange failed');
        const idn = resp.identity;
        let label = 'החיבור הושלם בהצלחה';
        if (isOneClick && (platform === 'gmail' || platform === 'google_drive')) {
          label = `חשבון ${idn.email ?? 'Google'} חובר בהצלחה`;
        } else if (platform === 'gmail') label = `חשבון ${idn.email ?? 'Google'} חובר בהצלחה`;
        else if (platform === 'youtube') label = `חשבון ${idn.channel_title ?? 'YouTube'} חובר בהצלחה`;
        else if (platform === 'google_drive') label = `חשבון ${idn.email ?? 'Google Drive'} חובר בהצלחה`;
        else if (platform === 'linkedin') label = `חשבון ${idn.email ?? idn.account_name ?? 'LinkedIn'} חובר בהצלחה`;
        toast.success(label, { id: toastId });
        await refetch();
        queryClient.invalidateQueries({ queryKey: ['social-connections'] });
      } catch (e: any) {
        toast.error('אימות נכשל', { id: toastId, description: e?.message ?? '' });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [refetch, queryClient]);

  const handleConnect = async (def: PlatformDef) => {
    if (!isSuperAdmin) {
      toast.error('רק בעל החשבון רשאי לנהל חיבורים');
      return;
    }
    const method = SocialAutomationService.methodFor(def.platform);

    if (def.platform === 'facebook' || def.platform === 'instagram') {
      setBusy(def.platform);
      try {
        const { data, error } = await supabase.functions.invoke('meta-page-connect', {
          body: {
            action: 'start',
            redirect_uri: oauthRedirectUri(),
            return_origin: oauthReturnOrigin(),
          },
        });
        if (error) throw error;
        const authUrl = String((data as any)?.auth_url ?? '');
        if (!authUrl) throw new Error('לא התקבל קישור חיבור מ-Meta');
        window.top.location.href = authUrl;
      } catch (error: any) {
        setBusy(null);
        toast.error('לא ניתן לפתוח את חיבור פייסבוק', {
          description: String(error?.message ?? 'החיבור לפייסבוק נכשל.'),
        });
      }
      return;
    }

    if (method === 'oauth' && !isDemoMode) {
      // Real OAuth path - require BYOK credentials.
      const launched = launchRealOAuth(def);
      if (!launched) {
        setConfigFor(def);
        return;
      }
      return;
    }

    // QR / OTP / demo-mode OAuth → Magic Connect modal (real session token, not static).
    setActive(def);
  };

  const handleDisconnect = async (platform: string) => {
    setBusy(platform);
    try {
      await SocialAutomationService.disconnect(platform);
      await refetch();
      toast.success('החיבור נותק והסשן נוקה');
    } catch (e: any) {
      toast.error(e?.message ?? 'שגיאה בניתוק החיבור');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Super-admin only: shared OAuth app credentials for One-Click flows */}
      {isSuperAdmin && <SharedOAuthAppsCard />}

      {/* Platform Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {visiblePlatforms.map((def) => {
          const conn = byPlatform.get(def.platform);
          const live = SocialAutomationService.isLive(conn);
          const verifiedIdentity = conn?.credentials?.verified_identity as
            | { account_name?: string; email?: string; channel_title?: string; subscriber_count?: number }
            | undefined;
          const isGoogle = def.platform === 'gmail' || def.platform === 'youtube';
          const isGoogleAny = isGoogle || def.platform === 'google_drive';
          // For Google platforms in production mode we ONLY trust verified
          // identity coming from the real Google API. No cached/demo labels.
          const rawAccountNameRaw = conn?.credentials?.account_name as string | undefined;
          // Suppress legacy "waiting for profile verification" placeholder.
          const rawAccountName = rawAccountNameRaw === 'ממתין לאימות פרופיל מהספק' ? undefined : rawAccountNameRaw;
          const accountName = isGoogle && !isDemoMode
            ? verifiedIdentity?.account_name
            : rawAccountName;
          const showNotConnected = isGoogle && !isDemoMode && !verifiedIdentity;
          const manualCreds = (conn?.credentials?.manual ?? {}) as Record<string, string>;
          const activityCount = activityFor(def.platform);

          return (
            <div
              key={def.platform}
              className={`group relative rounded-xl border p-4 flex flex-col gap-3 transition-all ${
                live
                  ? 'border-primary/40 bg-card shadow-[0_4px_24px_-12px_hsl(var(--primary)/0.45)]'
                  : 'border-border bg-card hover:border-primary/30 hover:shadow-md'
              }`}
            >
              {/* Health status dot — absolute to top-right of card (5px padding) */}
              {(() => {
                const lastStatus = conn?.last_test_status as string | undefined;
                const credsCheck = conn?.credentials?.credentials_check as
                  | { ok?: boolean }
                  | undefined;
                const hasCreds = !!manualCreds.oauth_client_id;
                const credsValid = credsCheck?.ok !== false;
                let dotColor = 'bg-muted-foreground/40';
                let dotTitle = 'לא מוגדר';
                if (live && lastStatus !== 'auth_failed' && credsValid) {
                  dotColor = 'bg-emerald-500';
                  dotTitle = 'מחובר ותקין';
                } else if (lastStatus === 'auth_failed' || credsCheck?.ok === false) {
                  dotColor = 'bg-destructive';
                  dotTitle = 'שגיאת חיבור';
                } else if (hasCreds) {
                  dotColor = 'bg-amber-500';
                  dotTitle = 'ממתין לאישור';
                }
                return (
                  <span
                    className="absolute top-[5px] right-[5px] flex h-2 w-2 shrink-0 z-10"
                    aria-label={dotTitle}
                    title={dotTitle}
                  >
                    {dotColor === 'bg-emerald-500' && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60 opacity-75" />
                    )}
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
                  </span>
                );
              })()}

              {/* Top row: logo + name on the right; Connect/Disconnect icon button on the top-left */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div className="relative shrink-0">
                    {live && <div className="absolute inset-0 rounded-full bg-primary/30 blur-md" />}
                    <div className="relative rounded-md bg-muted/40 border border-border/40 p-1.5">
                      <BrandLogo platform={def.platform} size={20} />
                    </div>
                  </div>
                  <div className="min-w-0 flex flex-col gap-1 flex-1">
                    <p className="text-sm font-semibold truncate leading-tight">{def.display_name}</p>
                    {/* Status / activity line — directly under the title.
                        No middle-states: only "live" shows activity, otherwise blank. */}
                    {live && accountName ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
                        {activityCount > 0 ? (
                          <>
                            <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-slate-400/60 opacity-75" />
                              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-slate-300" />
                            </span>
                            <Activity className="h-3 w-3 opacity-60 shrink-0" />
                            <span className="tabular-nums font-medium text-foreground/80">{activityCount}</span>
                            <span className="opacity-70 truncate">פעולות ב־24 שעות אחרונות</span>
                          </>
                        ) : (
                          <span className="italic opacity-70 truncate">אין פעילות ב־24 שעות האחרונות</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {live ? (
                    <>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="ניתוק"
                        title="ניתוק"
                        className="h-8 w-8 shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={busy === def.platform}
                        onClick={() => handleDisconnect(def.platform)}
                      >
                        {busy === def.platform ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Unlink className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        aria-label="ערוך הגדרות"
                        title="ערוך הגדרות / רענן טוקן"
                        className="h-8 w-8 shrink-0 bg-gradient-to-b from-slate-200 to-slate-300 hover:from-slate-100 hover:to-slate-200 text-slate-900 border border-slate-400/60 shadow-sm"
                        onClick={() => setConfigFor(def)}
                        disabled={!isSuperAdmin}
                      >
                        <KeyRound className="h-4 w-4 text-[hsl(222_47%_11%)]" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="icon"
                      aria-label="הגדרת חיבור"
                      title="הגדרת חיבור · API"
                      className="h-8 w-8 shrink-0 bg-gradient-to-b from-slate-200 to-slate-300 hover:from-slate-100 hover:to-slate-200 text-slate-900 border border-slate-400/60 shadow-sm"
                      onClick={() => setConfigFor(def)}
                      disabled={!isSuperAdmin}
                    >
                      <KeyRound className="h-4 w-4 text-[hsl(222_47%_11%)]" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Connected account name (only when live and account is known) */}
              {!showNotConnected && live && accountName && (
                <div dir="ltr" className="rounded-md bg-muted/40 border border-border/50 px-2.5 py-1.5 flex items-center gap-2 min-w-0">
                  <p className="text-xs font-medium truncate min-w-0 flex-1" dir="ltr">{accountName}</p>
                </div>
              )}

            </div>
          );
        })}
      </div>

      {!isSuperAdmin && (
        <p className="text-[11px] text-muted-foreground text-center">
          <Lock className="inline h-3 w-3 ml-1" />
          ניהול חיבורים שמור לבעל החשבון בלבד
        </p>
      )}

      {active && (
        <QuickConnectModal
          open={!!active}
          platform={active.platform}
          displayName={active.display_name}
          demoMode={isDemoMode}
          onOpenChange={(v) => !v && setActive(null)}
          onConnected={() => refetch()}
        />
      )}

      {configFor && (
        <ManualConfigModal
          open={!!configFor}
          platform={configFor.platform}
          displayName={configFor.display_name}
          isConnected={SocialAutomationService.isLive(byPlatform.get(configFor.platform))}
          onOpenChange={(v) => {
            if (!v) {
              const platform = configFor.platform;
              setConfigFor(null);
              // If the user opened this dialog from /campaigns via deep-link,
              // bounce them back regardless of save outcome.
              honorReturnTo(platform, SocialAutomationService.isLive(byPlatform.get(platform)));
            }
          }}
          onSaved={() => {
            const platform = configFor!.platform;
            refetch();
            // Defer redirect so refetch + toast inside modal can complete.
            setTimeout(() => honorReturnTo(platform, true), 250);
          }}
        />
      )}
    </div>
  );
}

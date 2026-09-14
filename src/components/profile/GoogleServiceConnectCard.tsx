import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, Loader2, AlertTriangle, ExternalLink, Unlink } from 'lucide-react';
import { BrandIcon } from '@/components/BrandIcon';
import { OAUTH_AUTHORIZE_URLS, OAUTH_SCOPES } from '@/lib/socialAutomationService';
import { clearPendingOAuth, currentOrigin, oauthRedirectUri, takePendingOAuth } from '@/lib/oauthRedirect';
import { onOAuthResult } from '@/lib/oauthPopupBridge';
import { friendlyGoogleError } from '@/lib/googleApiErrors';
import { forgetConnected, isRememberedConnected, rememberConnected, rememberedLabel } from '@/lib/connectionStatusCache';



type GooglePlatform = 'gmail' | 'google_calendar' | 'youtube';

/** Official Google service marks, rendered in their brand colors. */
export function GoogleBrandGlyph({
  brand,
  connected = true,
  className,
}: {
  brand?: 'gmail' | 'calendar' | 'youtube';
  connected?: boolean;
  className?: string;
}) {
  const stateClass = connected ? '' : 'grayscale opacity-40';
  const iconClass = `h-5 w-5 shrink-0 ${stateClass} ${className ?? ''}`;
  if (brand === 'youtube') {
    return <BrandIcon name="youtube" className={`${iconClass} text-[#FF0000]`} />;
  }
  if (brand === 'gmail') {
    return (
      <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
        <path fill="#EA4335" d="M2 6.5A2.5 2.5 0 0 1 6.02 4.5L12 9l5.98-4.5A2.5 2.5 0 0 1 22 6.5V19a1 1 0 0 1-1 1h-2.5v-8.2L12 16.4 5.5 11.8V20H3a1 1 0 0 1-1-1z" />
      </svg>
    );
  }
  if (brand === 'calendar') {
    return (
      <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
        <rect x="3" y="4" width="18" height="17" rx="2.5" fill="#4285F4" />
        <rect x="6" y="7" width="12" height="11" rx="1.5" fill="#fff" />
        <path fill="#4285F4" d="M9.6 15.6v-1.1c.5.3 1 .5 1.6.5.7 0 1.1-.3 1.1-.8s-.4-.8-1.2-.8h-.6v-1h.5c.7 0 1.1-.3 1.1-.7 0-.4-.3-.7-.9-.7-.5 0-1 .2-1.4.5v-1.1c.5-.3 1-.4 1.6-.4 1.2 0 2 .6 2 1.5 0 .6-.3 1-.9 1.2.7.2 1.1.7 1.1 1.4 0 1-.9 1.7-2.2 1.7-.7 0-1.3-.1-1.8-.2z" />
      </svg>
    );
  }
  return null;
}

/**
 * One-click Google connect row (Gmail / Google Calendar).
 * Resolves the OAuth client_id via the `google-oauth-config` edge function
 * (shared workspace app or GOOGLE_CLIENT_ID/SECRET project secrets), opens
 * the consent popup, and hands the returned code to `google-oauth-exchange`.
 * When no Google OAuth credentials are configured anywhere, renders an
 * inline setup notice instead of failing mid-flow.
 */
export function GoogleServiceConnectCard({
  platform,
  title,
  hint,
  ctaLabel,
  brand,
}: {
  platform: GooglePlatform;
  title: string;
  hint: string;
  /** Button label, e.g. "חיבור Gmail". */
  ctaLabel?: string;
  /** Which official logo to render next to the title. */
  brand?: 'gmail' | 'calendar' | 'youtube';
}) {
  const [configError, setConfigError] = useState(false);
  const [explicitlyDisconnected, setExplicitlyDisconnected] = useState(() => {
    try {
      return window.localStorage.getItem(`realtyz:google-explicit-disconnect:${platform}`) === '1';
    } catch {
      return false;
    }
  });

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['google-service-conn', platform],
    queryFn: async () => {
      // NEVER use .maybeSingle() here: more than one row for the same platform
      // may be visible (e.g. super admin), which used to error out and render a
      // live connection as "disconnected". Take the connected row first.
      const { data } = await supabase
        .from('social_connections')
        .select('id, is_connected, credentials, connected_at')
        .eq('platform', platform)
        .order('is_connected', { ascending: false })
        .order('connected_at', { ascending: false })
        .limit(1);
      return (data ?? [])[0] ?? null;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const creds = (data?.credentials as any) ?? {};
  const identity = creds.verified_identity ?? {};
  // Different exchange versions stored the account under different keys, so we
  // look through all of them to always surface the connected address.
  const credEmail: string | null =
    identity.email ??
    creds.email ??
    creds.account_email ??
    creds.user_email ??
    creds.channel_title ??
    identity.name ??
    null;
  const liveConnected = !!data?.is_connected;
  // A connected service stays connected in the UI until the broker disconnects
  // it explicitly — a pending query or a transient failure never flips it back.
  useEffect(() => {
    if (liveConnected) {
      rememberConnected(platform, null, credEmail);
      try {
        window.localStorage.removeItem(`realtyz:google-explicit-disconnect:${platform}`);
      } catch { /* storage may be unavailable */ }
      setExplicitlyDisconnected(false);
    }
  }, [liveConnected, platform, credEmail]);
  const connected = liveConnected || isRememberedConnected(platform);
  const accountLabel = credEmail ?? rememberedLabel(platform);

  /** Explicit, user-initiated disconnect — the only way to clear the status. */
  const disconnect = async () => {
    try {
      if (data?.id) {
        await supabase.from('social_connections').update({ is_connected: false }).eq('id', data.id);
      }
      forgetConnected(platform);
      try {
        window.localStorage.setItem(`realtyz:google-explicit-disconnect:${platform}`, '1');
      } catch { /* storage may be unavailable */ }
      setExplicitlyDisconnected(true);
      toast.success('החיבור נותק');
      refetch();
    } catch {
      toast.error('הניתוק נכשל, נסו שוב');
    }
  };

  /** Exchange an authorization code returned by Google for tokens. */
  const exchange = useCallback(
    async (code: string, redirectUri: string) => {
      const tId = toast.loading('מחבר לחשבון Google...');
      try {
        const { data: resp, error } = await supabase.functions.invoke('google-oauth-exchange', {
          body: { platform, code, redirect_uri: redirectUri },
        });
        if (error || !(resp as any)?.ok) throw new Error((resp as any)?.error || error?.message || 'נכשל');
        const connectedEmail = (resp as any).identity?.email ?? null;
        rememberConnected(platform, null, connectedEmail);
        try {
          window.localStorage.removeItem(`realtyz:google-explicit-disconnect:${platform}`);
        } catch { /* storage may be unavailable */ }
        setExplicitlyDisconnected(false);
        toast.success('החיבור הושלם', { id: tId, description: connectedEmail });
        refetch();
      } catch (e: any) {
        const friendly = friendlyGoogleError(e, platform);
        toast.error(friendly.title, {
          id: tId,
          description: friendly.message,
          duration: friendly.apiDisabled ? 15000 : 6000,
          action: friendly.enableUrl
            ? { label: 'הפעלת ה-API', onClick: () => window.open(friendly.enableUrl!, '_blank', 'noreferrer') }
            : undefined,
        });
      }
    },
    [platform, refetch],
  );

  // Full-page redirect flow: the /oauth/callback route stashes the returned
  // code, we pick it up here on mount and complete the token exchange.
  useEffect(() => {
    const pending = takePendingOAuth(`${platform}:`);
    if (!pending) return;
    if (pending.error || !pending.code) {
      toast.error('החיבור בוטל', { description: pending.errorDescription || pending.error || 'לא הוחזר קוד אימות' });
      return;
    }
    void exchange(pending.code, pending.redirectUri || oauthRedirectUri());
  }, [platform, exchange]);

  // Popup path: the callback either finished the exchange itself and reports
  // via the bridge, or hands back the raw code for us to exchange here.
  useEffect(() => {
    const unsubscribe = onOAuthResult(platform, (res) => {
      if (res.ok) {
        rememberConnected(platform, null, res.name || null);
        try {
          window.localStorage.removeItem(`realtyz:google-explicit-disconnect:${platform}`);
        } catch { /* storage may be unavailable */ }
        setExplicitlyDisconnected(false);
        toast.success('החיבור הושלם', { description: res.name || undefined });
        refetch();
      } else if (res.reason && res.reason !== 'needs_page_selection') {
        toast.error('החיבור נכשל', { description: res.reason });
      }
    });
    const handler = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const m: any = ev.data;
      if (!m || m.type !== 'realtyz-oauth-callback') return;
      if (!String(m.state || '').startsWith(`${platform}:`)) return;
      if (m.error || !m.code) {
        toast.error('החיבור בוטל', { description: m.errorDescription || m.error });
        return;
      }
      void exchange(m.code, m.redirectUri || oauthRedirectUri());
    };
    window.addEventListener('message', handler);
    return () => {
      unsubscribe();
      window.removeEventListener('message', handler);
    };
  }, [platform, exchange, refetch]);


  const connect = async () => {
    setConfigError(false);
    let clientId = '';
    try {
      const { data: cfg, error } = await supabase.functions.invoke('google-oauth-config', { body: {} });
      if (error) throw error;
      if ((cfg as any)?.configured && (cfg as any)?.client_id) {
        clientId = String((cfg as any).client_id).trim();
      }
    } catch {
      // fall through to the setup notice
    }
    if (!clientId) {
      setConfigError(true);
      toast.error('לא הוגדרו אישורי Google', { description: 'שמרו Client ID ו־Client Secret ולאחר מכן נסו שוב.' });
      return;
    }
    clearPendingOAuth();
    // Return-origin is encoded in the last state segment so the canonical
    // callback can bounce back to preview / custom domains.
    const returnToken = btoa(encodeURIComponent(currentOrigin())).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const redirectUri = oauthRedirectUri(); // https://realtyz.co.il/oauth/callback
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: OAUTH_SCOPES[platform].join(' '),
      access_type: 'offline',
      prompt: 'consent select_account',
      include_granted_scopes: 'true',
      state: `${platform}:${returnToken}`,
    });
    window.location.assign(`${OAUTH_AUTHORIZE_URLS[platform]}?${params.toString()}`);
  };




  return (
    <div dir="rtl" className="rounded-xl border bg-muted/30 p-3 text-right">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <GoogleBrandGlyph brand={brand} connected={connected} className="mt-0.5" />
          <div className="min-w-0">
            <h4 className="text-sm font-semibold">{title}</h4>
            {accountLabel && (
              <p className="mt-1 truncate text-[13px] font-medium text-foreground/70" dir="ltr">
                {accountLabel}
              </p>
            )}
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{hint}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <span className="inline-flex h-8 items-center gap-1 text-[13px] font-bold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> מחובר
            </span>
          ) : explicitlyDisconnected && !isLoading ? (
            <Button size="sm" className="h-8 gap-1 text-xs" onClick={connect}>
              {ctaLabel ?? 'חבר'}
            </Button>
          ) : isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="בודק חיבור" />
          ) : (
            <span className="inline-flex h-8 items-center gap-1 text-[13px] font-bold text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> לא מחובר
            </span>
          )}
          {connected && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  style={{ color: 'hsl(0 72% 45%)', borderColor: 'hsl(0 72% 70%)' }}
                  aria-label="ניתוק החיבור"
                  title="ניתוק החיבור"
                >
                  <Unlink className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl" className="text-right">
                <AlertDialogHeader>
                  <AlertDialogTitle>לנתק את {title}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    החיבור יימחק והאוטומציות שתלויות בו יפסיקו לפעול. תמיד ניתן לחבר מחדש.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2 sm:justify-start">
                  <AlertDialogCancel>ביטול</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void disconnect()}
                    style={{ backgroundColor: 'hsl(0 72% 45%)', color: '#fff' }}
                  >
                    ניתוק
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {configError && !connected && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-[13px] leading-relaxed">
              <p className="font-semibold text-amber-800 dark:text-amber-300">נדרשת הגדרת אפליקציית Google חד־פעמית</p>
              <ol className="mt-1 list-decimal space-y-0.5 pr-4 text-amber-700 dark:text-amber-400">
                <li>פתחו את Google Cloud Console ← Credentials וצרו OAuth Client (Web).</li>
                <li>
                  הוסיפו את כתובת החזרה:{' '}
                  <code dir="ltr" className="rounded bg-amber-100 px-1 dark:bg-amber-900">
                    https://realtyz.co.il/oauth/callback
                  </code>
                </li>
                <li>שמרו את ה־Client ID וה־Client Secret באישורי ה־OAuth המשותפים של Google במערכת.</li>
              </ol>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-7 gap-1 text-xs"
                onClick={() => window.open('https://console.cloud.google.com/apis/credentials', '_blank')}
              >
                <ExternalLink className="h-3 w-3" /> פתיחת Google Cloud Console
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GoogleServiceConnectCard;

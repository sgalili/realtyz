import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, AlertTriangle, ExternalLink } from 'lucide-react';
import { OAUTH_AUTHORIZE_URLS, OAUTH_SCOPES } from '@/lib/socialAutomationService';
import { clearPendingOAuth, currentOrigin, oauthRedirectUri, takePendingOAuth } from '@/lib/oauthRedirect';
import { onOAuthResult } from '@/lib/oauthPopupBridge';



type GooglePlatform = 'gmail' | 'google_calendar' | 'youtube';

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
}: {
  platform: GooglePlatform;
  title: string;
  hint: string;
}) {
  const [configError, setConfigError] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['google-service-conn', platform],
    queryFn: async () => {
      const { data } = await supabase
        .from('social_connections')
        .select('id, is_connected, credentials')
        .eq('platform', platform)
        .maybeSingle();
      return data;
    },
  });

  const identity = (data?.credentials as any)?.verified_identity;
  const connected = !!data?.is_connected;

  /** Exchange an authorization code returned by Google for tokens. */
  const exchange = useCallback(
    async (code: string, redirectUri: string) => {
      const tId = toast.loading('מחבר לחשבון Google...');
      try {
        const { data: resp, error } = await supabase.functions.invoke('google-oauth-exchange', {
          body: { platform, code, redirect_uri: redirectUri },
        });
        if (error || !(resp as any)?.ok) throw new Error((resp as any)?.error || error?.message || 'נכשל');
        toast.success('החיבור הושלם', { id: tId, description: (resp as any).identity?.email });
        refetch();
      } catch (e: any) {
        toast.error('החיבור נכשל', { id: tId, description: e?.message });
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span>{title}</span>
            {connected && (
              <Badge className="gap-1 border-transparent bg-emerald-600 text-[11px] font-semibold text-white">
                <CheckCircle2 className="h-3 w-3" /> מחובר
              </Badge>
            )}
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {connected && identity?.email ? <span dir="ltr">{identity.email}</span> : hint}
          </p>
        </div>
        <Button size="sm" variant={connected ? 'outline' : 'default'} className="h-8 gap-1 text-xs" onClick={connect}>
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {connected ? 'חבר מחדש' : 'חיבור מהיר בקליק'}
        </Button>
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

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Facebook, Instagram, Loader2, RefreshCw, Unlink, CheckCircle2, KeyRound, ChevronDown, Copy, AlertTriangle } from 'lucide-react';
import { useFacebookHealth, useRefreshFacebookHealth, useResetFacebookHealth } from '@/hooks/useFacebookHealth';
import { useMetaPageBinding, useRefreshMetaPageBinding } from '@/hooks/useMetaPageBinding';
import { FacebookTargetsCard } from '@/components/profile/FacebookTargetsCard';

import { clearPendingOAuth, describeOAuthFailure, isRedirectUriFailure, logOAuthRedirectUri, metaConsoleSetupSteps, oauthRedirectUri, oauthReturnOrigin, redirectWhitelistHint, takePendingOAuth } from '@/lib/oauthRedirect';


export type MetaStatus = {
  connected: boolean;
  facebook: { id: string; name: string | null } | null;
  instagram: { id: string; username: string | null } | null;
  message?: string | null;
};

type PageStatus = {
  connected: boolean;
  page: { id: string; name: string | null; picture: string | null; connected_at: string | null } | null;
  instagram?: { id: string; username: string | null } | null;
};

const STATE_PREFIX = 'facebook_page:';
/** Emergency ceiling for the callback token exchange — spinner never outlives it. */
const EXCHANGE_TIMEOUT_MS = 20_000;
/** Absolute safety net: the spinner is force-cleared this long after it starts. */
const SPINNER_SAFETY_MS = 5_000;


function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { window.clearTimeout(timer); resolve(v); },
      (e) => { window.clearTimeout(timer); reject(e); },
    );
  });
}

async function callPageConnect<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('meta-page-connect', { body });
  if (error) {
    const raw = String(error?.message ?? error);
    throw new Error(
      /failed to (send|fetch)/i.test(raw) ? 'לא ניתן להגיע לשירות החיבור לפייסבוק. נסה שוב בעוד רגע.' : raw,
    );
  }
  if (data && (data as any).error) throw new Error(String((data as any).error));
  return data as T;
}


/**
 * MetaDirectConnectionCard — connects a Facebook Page (and its linked
 * Instagram Business account) through the official Facebook Login flow and
 * shows the live publishing status for direct Meta Graph publishing.
 */
export const MetaDirectConnectionCard = forwardRef<HTMLDivElement, { onStatus?: (s: MetaStatus | null) => void }>(function MetaDirectConnectionCard({ onStatus }, ref) {
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [page, setPage] = useState<PageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPageId, setManualPageId] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [savingManual, setSavingManual] = useState(false);
  // Shown when Meta refuses the redirect URI (or the popup could not open) so
  // the exact URI to whitelist is always one copy-click away.
  const [redirectHelp, setRedirectHelp] = useState(false);
  // Meta App ID actually used by the backend when building the login dialog —
  // shown in the help panel so it can be compared with the Meta Developer app
  // where the production redirect URIs are registered.
  const [appId, setAppId] = useState<string | null>(null);

  // Shared reactive connection state (same cache as the collapsed header badge
  // and the global warning banner).
  const { data: health } = useFacebookHealth();
  // DB-direct binding: renders the saved page instantly (no Graph round-trip).
  const { data: binding } = useMetaPageBinding();
  const refreshBinding = useRefreshMetaPageBinding();
  const refreshHealth = useRefreshFacebookHealth();
  const resetHealth = useResetFacebookHealth();

  const [disconnecting, setDisconnecting] = useState(false);
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const disconnectedRef = useRef(false);
  const expectedStateRef = useRef<string | null>(null);
  const exchangingRef = useRef(false);



  const probe = useCallback(async (notify = false) => {
    setLoading(true);
    // The stored page binding is the source of truth for "connected".
    // meta-publish/status is only an extra health probe: if it fails we must
    // NOT drop the binding-based connected state.
    const [pubRes, pageRes] = await Promise.all([
      supabase.functions.invoke('meta-publish', { body: { action: 'status' } }).catch((e: any) => ({ data: null, error: e })),
      callPageConnect<PageStatus>({ action: 'status' }).catch(() => null),
    ]);
    if (disconnectedRef.current) {
      setLoading(false);
      return;
    }
    setPage(pageRes);

    const s = (pubRes as any).error ? null : ((pubRes as any).data as MetaStatus | null);
    setStatus(s);
    onStatus?.(s ?? (pageRes?.connected
      ? {
          connected: true,
          facebook: { id: pageRes.page?.id ?? '', name: pageRes.page?.name ?? null },
          instagram: pageRes.instagram ?? null,
        }
      : null));

    refreshHealth();

    refreshBinding();

    if (notify) {
      if (pageRes?.connected || s?.connected) toast.success('החיבור לפייסבוק תקין');
      else toast.error(s?.message || 'דף הפייסבוק אינו מחובר');
    }
    setLoading(false);
  }, [onStatus, refreshHealth, refreshBinding]);


  useEffect(() => { probe(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const finishExchange = useCallback(
    async (grant: { code?: string | null; accessToken?: string | null }, redirectUri: string) => {
      if (exchangingRef.current) return;
      exchangingRef.current = true;
      setConnecting(true);
      // Emergency safety net: the spinner is released after 5s so the user can
      // retry or use the manual token path. The request itself keeps running —
      // if it succeeds afterwards the connected state still lands.
      const safety = window.setTimeout(() => {
        setConnecting(false);
        setLoading(false);
        setManualOpen(true);
        toast.error('החיבור לפייסבוק לא הושלם בזמן', {
          description: 'נסה להתחבר שוב, או חבר את העמוד ידנית באמצעות Page Access Token.',
        });
      }, SPINNER_SAFETY_MS);
      try {
        if (!grant.code && !grant.accessToken) {
          throw new Error('פייסבוק לא החזיר קוד אימות. נסה להתחבר שוב.');
        }
        const res = await withTimeout(
          callPageConnect<any>({
            action: 'exchange',
            code: grant.code ?? undefined,
            user_access_token: grant.accessToken ?? undefined,
            redirect_uri: redirectUri,
          }),
          EXCHANGE_TIMEOUT_MS,
          'החיבור לפייסבוק לא הושלם בזמן. נסה שוב או חבר ידנית באמצעות טוקן.',
        );
        window.clearTimeout(safety);
        setManualOpen(false);
        if (res?.page?.id) {
          setPage({
            connected: true,
            page: {
              id: String(res.page.id),
              name: res.page?.name ?? null,
              picture: res.page?.picture ?? null,
              connected_at: new Date().toISOString(),
            },
            instagram: res?.instagram ?? null,
          });
        }
        toast.success('עמוד הפייסבוק חובר', { description: res?.page?.name ?? undefined });
        // Import the groups reachable from the fresh token so the targets list
        // is populated without an extra manual step.
        void supabase.functions.invoke('fb-groups-import', { body: {} }).catch(() => undefined);
        refreshBinding();
        refreshHealth();
        await probe(false).catch(() => undefined);
      } catch (e: any) {
        window.clearTimeout(safety);
        if (isRedirectUriFailure(e?.message)) setRedirectHelp(true);
        toast.error('חיבור עמוד הפייסבוק נכשל', { description: describeOAuthFailure(e?.message) });
        // Never leave the user trapped: offer the manual token path immediately.
        setManualOpen(true);
      } finally {
        window.clearTimeout(safety);
        exchangingRef.current = false;
        setConnecting(false);
        setLoading(false);
      }
    },
    [probe, refreshBinding, refreshHealth],
  );



  // Full-page redirect result: /oauth/callback exchanged the code in the main
  // app context and came back here with an explicit success/error state.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('fb');
    const strip = () => {
      params.delete('fb');
      params.delete('fb_reason');
      params.delete('fb_page');
      const qs = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    };

    if (outcome === 'connected') {
      strip();
      clearPendingOAuth();
      setConnecting(false);
      setManualOpen(false);
      toast.success('עמוד הפייסבוק חובר', { description: params.get('fb_page') || undefined });
      refreshBinding();
      refreshHealth();
      void probe(false).catch(() => undefined);
      return;
    }

    if (outcome === 'error') {
      strip();
      clearPendingOAuth();
      setConnecting(false);
      const reason = params.get('fb_reason');
      if (isRedirectUriFailure(reason)) setRedirectHelp(true);
      setManualOpen(true);
      toast.error('חיבור עמוד הפייסבוק נכשל', { description: describeOAuthFailure(reason) });
      return;
    }

    // Legacy stashed result (other providers / older sessions).
    const pending = takePendingOAuth(STATE_PREFIX);
    if (!pending) return;
    if (pending.error || !(pending.code || pending.accessToken)) {
      toast.error('חיבור עמוד הפייסבוק בוטל', {
        description: describeOAuthFailure(pending.errorDescription || pending.error),
      });
      return;
    }
    setConnecting(true);
    void finishExchange(
      { code: pending.code, accessToken: pending.accessToken ?? null },
      pending.redirectUri || oauthRedirectUri(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    disconnectedRef.current = false;
    expectedStateRef.current = null;
    exchangingRef.current = false;
    setConnecting(true);
    try {
      clearPendingOAuth();
      const res = await withTimeout(
        callPageConnect<any>({
          action: 'start',
          redirect_uri: logOAuthRedirectUri('facebook-page'),
          return_origin: oauthReturnOrigin(),
        }),
        EXCHANGE_TIMEOUT_MS,
        'שירות החיבור לפייסבוק לא הגיב בזמן. נסה שוב.',
      );

      if (res?.app_id) setAppId(String(res.app_id));
      if (!res?.auth_url) throw new Error('לא הוחזרה כתובת אימות מפייסבוק');
      // Direct full-page redirect: no popup, no postMessage, no cross-origin
      // closure races. /oauth/callback finishes the exchange and returns here.
      // Use window.top so the outer browser window navigates when the app is
      // rendered inside a preview iframe.
      window.top.location.href = String(res.auth_url);
    } catch (e: any) {
      setConnecting(false);
      setLoading(false);

      // App in development mode / missing app config → guide to the manual path.
      // Only open the redirect-URI help when the failure really is a blocked URL;
      // the production callback is whitelisted, so a generic error must not raise
      // a false "URL Blocked" alarm.
      setManualOpen(true);
      if (isRedirectUriFailure(e?.message)) setRedirectHelp(true);
      toast.error('לא ניתן לפתוח את חיבור פייסבוק', {
        description: `${describeOAuthFailure(e?.message)} — ניתן לחבר את העמוד ידנית באמצעות Page Access Token.`,
      });
    }
  };



  const disconnect = async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    disconnectedRef.current = true;
    // Optimistic atomic wipe: all badges and cached names disappear on the
    // click, while the backend performs the definitive credential deletion.
    setPage({ connected: false, page: null });
    setStatus(null);
    setManualPageId('');
    setManualToken('');
    setManualOpen(false);
    onStatus?.(null);
    clearPendingOAuth();
    await resetHealth();
    setConnectionEpoch((value) => value + 1);
    try {
      const result = await callPageConnect<{ ok?: boolean }>({ action: 'disconnect' });
      if (!result?.ok) throw new Error('השרת לא אישר שהחיבור נמחק');
      await resetHealth();
      refreshHealth();
      refreshBinding();
      toast.success('עמוד הפייסבוק נותק');
    } catch (e: any) {
      toast.error('ניתוק נכשל', { description: e?.message });
    } finally {
      setDisconnecting(false);
    }
  };

  const saveManual = async () => {
    setSavingManual(true);
    try {
      const res = await callPageConnect<any>({
        action: 'manual',
        page_id: manualPageId.trim(),
        page_access_token: manualToken.trim(),
      });
      // Flip the pill to "connected" instantly from the verified response.
      setPage({
        connected: true,
        page: {
          id: String(res?.page?.id ?? manualPageId.trim()),
          name: res?.page?.name ?? null,
          picture: res?.page?.picture ?? null,
          connected_at: new Date().toISOString(),
        },
        instagram: res?.instagram ?? null,
      });
      onStatus?.({
        connected: true,
        facebook: { id: String(res?.page?.id ?? manualPageId.trim()), name: res?.page?.name ?? null },
        instagram: res?.instagram ?? null,
      });
      toast.success('הטוקן נשמר והעמוד חובר', { description: res?.page?.name ?? undefined });
      void supabase.functions.invoke('fb-groups-import', { body: {} }).catch(() => undefined);
      setManualToken('');
      setManualOpen(false);
      await probe(false);
    } catch (e: any) {
      toast.error('שמירת הטוקן נכשלה', { description: e?.message });
    } finally {

      setSavingManual(false);
    }
  };

  const redirectSetup = metaConsoleSetupSteps();

  const copyUri = async (uri: string) => {
    try {
      await navigator.clipboard.writeText(uri);
      toast.success('הכתובת הועתקה');
    } catch {
      toast.info('העתק ידנית', { description: uri });
    }
  };

  const pageName =
    health?.pageName ?? page?.page?.name ?? status?.facebook?.name ?? binding?.pageName
    ?? health?.pageId ?? status?.facebook?.id ?? binding?.pageId ?? null;
  const igHandle =
    health?.instagram?.username ?? page?.instagram?.username ?? status?.instagram?.username ?? status?.instagram?.id ?? null;
  const pagePicture = page?.page?.picture ?? health?.pagePicture ?? binding?.pageAvatarUrl ?? null;
  // The stored DB binding (page id + token) renders "connected" instantly,
  // without waiting for the Graph health probe to come back.
  const isConnected = disconnectedRef.current
    ? false
    : !!health?.pageConnected || !!page?.connected || !!(binding?.hasToken && binding?.pageId);


  return (
    <Card key={connectionEpoch} ref={ref} dir="rtl" className="text-right">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-right">
          <Facebook className="h-5 w-5 text-primary" />
          <span>פרסום ישיר לפייסבוק ואינסטגרם (Meta Graph)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {isConnected ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            {pagePicture ? (
              <img src={pagePicture} alt={pageName ?? 'עמוד פייסבוק'} className="h-11 w-11 rounded-full object-cover" />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                <Facebook className="h-5 w-5 text-primary" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{pageName ?? 'עמוד פייסבוק'}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-700">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                מחובר ומוכן לפרסום
              </div>
            </div>
            <Badge className="gap-1 rounded-full border-0 bg-emerald-500 px-3 py-1 text-[12px] font-bold text-white shadow-md shadow-emerald-500/40 ring-2 ring-emerald-500/20 hover:bg-emerald-600">
              <CheckCircle2 className="h-4 w-4" strokeWidth={2.75} /> פעיל
            </Badge>


          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-3">
            <Button onClick={connect} disabled={connecting} className="w-full gap-2 bg-[#1877F2] text-white hover:bg-[#1877F2]/90">
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
              חבר עמוד פייסבוק
            </Button>
          </div>
        )}

        {isConnected && <FacebookTargetsCard key={`targets-${connectionEpoch}`} />}


        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={igHandle ? 'default' : 'secondary'} className="gap-1.5">
            <Instagram className="h-3.5 w-3.5" />
            {igHandle ? `אינסטגרם: @${igHandle}` : 'אינסטגרם לא מקושר'}
          </Badge>
        </div>

        {status && !status.connected && status.message && (
          <p className="text-xs text-destructive">{status.message}</p>
        )}

        {/* Exact redirect URI that must be whitelisted in the Meta app */}
        <div className="rounded-xl border">
          <button
            type="button"
            onClick={() => {
              setRedirectHelp((v) => !v);
              if (!appId) {
                void callPageConnect<any>({ action: 'app_info' })
                  .then((r) => { if (r?.app_id) setAppId(String(r.app_id)); })
                  .catch(() => undefined);
              }
            }}
            aria-expanded={redirectHelp}
            className="flex w-full items-center justify-between gap-2 p-3 text-right"
          >
            <span className="flex items-center gap-2 text-xs font-medium">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              הגדרות Meta (App ID וכתובת חזרה)
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${redirectHelp ? 'rotate-180' : ''}`} />
          </button>
          {redirectHelp && (
            <div className="space-y-3 border-t p-3">
              <div className="space-y-1">
                <p className="text-[11px] font-medium">Meta App ID בשימוש:</p>
                <div className="flex items-center gap-2 rounded-lg bg-muted p-2">
                  <code dir="ltr" className="flex-1 truncate text-left text-[11px]">{appId ?? '—'}</code>
                  {appId && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => copyUri(appId)}>
                      <Copy className="h-3.5 w-3.5" /> העתק
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  ודא שזו אותה אפליקציה שבה רשומות כתובות החזרה לפרודקשן.
                </p>
              </div>
              <p className="text-[11px] font-medium">{redirectSetup.title}:</p>

              <div className="flex items-center gap-2 rounded-lg bg-muted p-2">
                <code dir="ltr" className="flex-1 truncate text-left text-[11px]">{redirectSetup.uri}</code>
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => copyUri(redirectSetup.uri)}>
                  <Copy className="h-3.5 w-3.5" /> העתק
                </Button>
              </div>
              <ol className="list-inside list-decimal space-y-1 text-[11px] text-muted-foreground">
                {redirectSetup.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">מומלץ להוסיף את כל הכתובות הבאות בבת אחת:</p>
                {redirectSetup.allUris.map((uri) => (
                  <div key={uri} className="flex items-center gap-2">
                    <code dir="ltr" className="flex-1 truncate text-left text-[10px] text-muted-foreground">{uri}</code>
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyUri(uri)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Manual token fallback for apps blocked in development/testing mode */}
        <div className="rounded-xl border">
          <button
            type="button"
            onClick={() => setManualOpen((v) => !v)}
            aria-expanded={manualOpen}
            className="flex w-full items-center justify-between gap-2 p-3 text-right"
          >
            <span className="flex items-center gap-2 text-xs font-medium">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              חיבור ידני באמצעות טוקן
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${manualOpen ? 'rotate-180' : ''}`} />
          </button>
          {manualOpen && (
            <div className="space-y-3 border-t p-3">
              <p className="text-[11px] text-muted-foreground">
                שימושי כאשר אפליקציית Meta נמצאת במצב פיתוח או חסומה. הטוקן נשמר בצד השרת בלבד.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="meta-page-id" className="text-xs">Page ID</Label>
                <Input
                  id="meta-page-id"
                  dir="ltr"
                  inputMode="numeric"
                  value={manualPageId}
                  placeholder="61580625810292"
                  onChange={(e) => setManualPageId(e.target.value)}
                  className="text-left"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meta-page-token" className="text-xs">Page Access Token</Label>
                <Input
                  id="meta-page-token"
                  dir="ltr"
                  type="password"
                  autoComplete="off"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  className="text-left"
                />
              </div>
              <Button size="sm" onClick={saveManual} disabled={savingManual} className="w-full gap-1.5">
                {savingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                שמור טוקן ידני
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => probe(true)} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            בדיקת חיבור
          </Button>
          {isConnected && (
            <>
              <Button variant="outline" size="sm" onClick={connect} disabled={connecting} className="gap-1.5">
                <Facebook className="h-4 w-4" /> החלף עמוד
              </Button>
              <Button variant="ghost" size="sm" onClick={disconnect} disabled={disconnecting} className="gap-1.5 text-destructive">
                {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />} נתק
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

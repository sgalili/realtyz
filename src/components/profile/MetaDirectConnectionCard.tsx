import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Facebook, Instagram, Loader2, RefreshCw, Unlink, CheckCircle2, KeyRound, ChevronDown } from 'lucide-react';
import { useFacebookHealth, useRefreshFacebookHealth, useResetFacebookHealth } from '@/hooks/useFacebookHealth';
import { clearPendingOAuth, describeOAuthFailure, logOAuthRedirectUri, oauthRedirectUri, oauthReturnOrigin, redirectWhitelistHint, takePendingOAuth } from '@/lib/oauthRedirect';


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
export function MetaDirectConnectionCard({ onStatus }: { onStatus?: (s: MetaStatus | null) => void }) {
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [page, setPage] = useState<PageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPageId, setManualPageId] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [savingManual, setSavingManual] = useState(false);
  // Shared reactive connection state (same cache as the collapsed header badge
  // and the global warning banner).
  const { data: health } = useFacebookHealth();
  const refreshHealth = useRefreshFacebookHealth();
  const resetHealth = useResetFacebookHealth();
  const [disconnecting, setDisconnecting] = useState(false);


  const probe = useCallback(async (notify = false) => {
    setLoading(true);
    // The stored page binding is the source of truth for "connected".
    // meta-publish/status is only an extra health probe: if it fails we must
    // NOT drop the binding-based connected state.
    const [pubRes, pageRes] = await Promise.all([
      supabase.functions.invoke('meta-publish', { body: { action: 'status' } }).catch((e: any) => ({ data: null, error: e })),
      callPageConnect<PageStatus>({ action: 'status' }).catch(() => null),
    ]);
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

    if (notify) {
      if (pageRes?.connected || s?.connected) toast.success('החיבור לפייסבוק תקין');
      else toast.error(s?.message || 'דף הפייסבוק אינו מחובר');
    }
    setLoading(false);
  }, [onStatus, refreshHealth]);


  useEffect(() => { probe(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const finishExchange = useCallback(
    async (code: string, redirectUri: string) => {
      try {
        const res = await callPageConnect<any>({ action: 'exchange', code, redirect_uri: redirectUri });
        toast.success('עמוד הפייסבוק חובר', { description: res?.page?.name ?? undefined });
        await probe(false);
      } catch (e: any) {
        toast.error('חיבור עמוד הפייסבוק נכשל', { description: describeOAuthFailure(e?.message) });
      } finally {
        setConnecting(false);
      }
    },
    [probe],
  );

  // Receive the OAuth code from the popup and exchange it server-side.
  useEffect(() => {
    const handler = async (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const m: any = ev.data;
      if (!m || m.type !== 'realtyz-oauth-callback') return;
      if (!String(m.state || '').startsWith(STATE_PREFIX)) return;
      if (m.error) {
        setConnecting(false);
        toast.error('חיבור עמוד הפייסבוק בוטל', {
          description: describeOAuthFailure(m.errorDescription || m.error),
        });
        return;
      }
      await finishExchange(String(m.code), oauthRedirectUri());
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishExchange]);

  // Full-page redirect fallback: the callback stashed the result before
  // bouncing back here (popup blocked / in-app browser).
  useEffect(() => {
    const pending = takePendingOAuth(STATE_PREFIX);
    if (!pending) return;
    if (pending.error || !pending.code) {
      toast.error('חיבור עמוד הפייסבוק בוטל', {
        description: describeOAuthFailure(pending.errorDescription || pending.error),
      });
      return;
    }
    setConnecting(true);
    void finishExchange(pending.code, pending.redirectUri || oauthRedirectUri());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setConnecting(true);
    // Reserve the popup synchronously while the click still has browser user
    // activation. Opening it after the backend request is blocked by Safari and
    // some mobile browsers.
    const popup = window.open('', 'realtyz-fb-page-oauth', 'width=560,height=680');
    try {
      clearPendingOAuth();
      const hint = redirectWhitelistHint();
      if (hint) toast.info('שים לב לכתובת החזרה של Meta', { description: hint });
      const res = await callPageConnect<any>({
        action: 'start',
        redirect_uri: logOAuthRedirectUri('facebook-page'),
        return_origin: oauthReturnOrigin(),
      });
      if (!res?.auth_url) throw new Error('לא הוחזרה כתובת אימות מפייסבוק');
      if (popup) {
        popup.location.href = res.auth_url;
      } else {
        // No popup: go full-page; /oauth/callback stashes the result and returns.
        window.location.href = res.auth_url;
        return;
      }
    } catch (e: any) {
      popup?.close();
      setConnecting(false);
      // App in development mode / missing app config → guide to the manual path.
      setManualOpen(true);
      toast.error('לא ניתן לפתוח את חיבור פייסבוק', {
        description: `${describeOAuthFailure(e?.message)} — ניתן לחבר את העמוד ידנית באמצעות Page Access Token.`,
      });
    }
  };


  const disconnect = async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    try {
      await callPageConnect({ action: 'disconnect' });
      setPage({ connected: false, page: null });
      setStatus(null);
      onStatus?.(null);
      clearPendingOAuth();
      await resetHealth();
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
      setManualToken('');
      setManualOpen(false);
      await probe(false);
    } catch (e: any) {
      toast.error('שמירת הטוקן נכשלה', { description: e?.message });
    } finally {

      setSavingManual(false);
    }
  };

  const pageName =
    health?.pageName ?? page?.page?.name ?? status?.facebook?.name ?? health?.pageId ?? status?.facebook?.id ?? null;
  const igHandle =
    health?.instagram?.username ?? page?.instagram?.username ?? status?.instagram?.username ?? status?.instagram?.id ?? null;
  const pagePicture = page?.page?.picture ?? health?.pagePicture ?? null;
  const isConnected = !!(health?.pageConnected || page?.connected || status?.facebook);

  return (
    <Card dir="rtl" className="text-right">
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
            <p className="mb-3 text-xs text-muted-foreground">
              חבר את עמוד הפייסבוק העסקי שלך כדי לפרסם פוסטים, תמונות וקרוסלות ישירות מהמערכת.
            </p>
            <Button onClick={connect} disabled={connecting} className="w-full gap-2 bg-[#1877F2] text-white hover:bg-[#1877F2]/90">
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
              חבר עמוד פייסבוק
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={igHandle ? 'default' : 'secondary'} className="gap-1.5">
            <Instagram className="h-3.5 w-3.5" />
            {igHandle ? `אינסטגרם: @${igHandle}` : 'אינסטגרם לא מקושר'}
          </Badge>
        </div>

        {status && !status.connected && status.message && (
          <p className="text-xs text-destructive">{status.message}</p>
        )}

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
}

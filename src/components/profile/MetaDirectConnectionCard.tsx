import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { openOAuthWindow } from '@/lib/openOAuthWindow';
import { onOAuthResult } from '@/lib/oauthPopupBridge';
import { requestExtensionGroups } from '@/lib/extensionGroupBridge';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Facebook, Instagram, Loader2, Unlink, CheckCircle2, KeyRound, ChevronDown } from 'lucide-react';

import { useFacebookHealth, useRefreshFacebookHealth, useResetFacebookHealth } from '@/hooks/useFacebookHealth';
import { useMetaPageBinding, useRefreshMetaPageBinding } from '@/hooks/useMetaPageBinding';
import { FacebookTargetsCard } from '@/components/profile/FacebookTargetsCard';

import { clearPendingOAuth, oauthRedirectUri, oauthReturnOrigin, takePendingOAuth } from '@/lib/oauthRedirect';


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

function describeConnectError(payload: any): string {
  const parts = [payload?.error, payload?.fb_message, payload?.error_detail?.details, payload?.error_detail?.hint]
    .filter((p) => typeof p === 'string' && p.trim().length > 0);
  const unique = Array.from(new Set(parts));
  return unique.join(' — ');
}

/** Error that keeps the JSON body so callers can react to flags like retry_basic. */
class PageConnectError extends Error {
  payload: any;
  constructor(message: string, payload: any) {
    super(message);
    this.payload = payload ?? null;
  }
}

async function callPageConnect<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('meta-page-connect', { body });
  if (error) {
    // Non-2xx responses hide the JSON body behind error.context — read it so the
    // user sees the real reason instead of "non-2xx status code".
    let detailed = '';
    let payload: any = null;
    try {
      const ctx: any = (error as any)?.context;
      payload = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
      detailed = describeConnectError(payload);
    } catch {
      detailed = '';
    }
    const raw = detailed || String(error?.message ?? error);
    throw new PageConnectError(
      /failed to (send|fetch)/i.test(raw) ? 'לא ניתן להגיע לשירות החיבור לפייסבוק. נסה שוב בעוד רגע.' : raw,
      payload,
    );
  }
  if (data && (data as any).error) {
    throw new PageConnectError(describeConnectError(data) || String((data as any).error), data);
  }
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
  const [bindings, setBindings] = useState<Array<{ id: string; name: string | null; picture: string | null; isDefault: boolean }>>([]);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [igHelpOpen, setIgHelpOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [tokenHelpOpen, setTokenHelpOpen] = useState(false);

  const [manualPageId, setManualPageId] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [savingManual, setSavingManual] = useState(false);
  // Fallback picker: shown when Meta returned pages but none could be auto-selected.
  const [pageOptions, setPageOptions] = useState<{ id: string; name: string | null; picture?: string | null }[]>([]);
  const [selectingPageId, setSelectingPageId] = useState<string | null>(null);

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

  const loadPageOptions = useCallback(async () => {
    try {
      const data = await callPageConnect<{ pages?: { id: string; name: string | null; picture?: string | null }[] }>({
        action: 'list_pages',
      });
      setPageOptions(data?.pages ?? []);
      if (!data?.pages?.length) toast.error('לא נמצאו עמודים לבחירה בחשבון המחובר');
    } catch (e: any) {
      toast.error('טעינת רשימת העמודים נכשלה', { description: e?.message });
    }
  }, []);

  const selectPage = useCallback(async (pageId: string) => {
    setSelectingPageId(pageId);
    try {
      const data = await callPageConnect<{ page?: { name?: string | null } }>({ action: 'select_page', page_id: pageId });
      setPageOptions([]);
      toast.success('עמוד הפרסום חובר', { description: data?.page?.name || undefined });
      refreshBinding();
      refreshHealth();
      void probe(false).catch(() => undefined);
    } catch (e: any) {
      toast.error('שמירת בחירת העמוד נכשלה', { description: e?.message });
    } finally {
      setSelectingPageId(null);
    }
  }, [probe, refreshBinding, refreshHealth]);

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
        // is populated without an extra manual step. Meta deprecated the Graph
        // groups API for new apps, so the companion extension is asked in
        // parallel — whichever source answers first fills the list.
        void supabase.functions.invoke('fb-groups-import', { body: {} }).catch(() => undefined);
        requestExtensionGroups();

        refreshBinding();
        refreshHealth();
        await probe(false).catch(() => undefined);
      } catch (e: any) {
        window.clearTimeout(safety);
        // ZERO-FRICTION FALLBACK: the shared platform Meta app may not have
        // advanced access for this user yet. Reopen the dialog automatically with
        // the review-free basic scopes instead of dead-ending the connection.
        if (e?.payload?.retry_basic) {
          try {
            const retry = await callPageConnect<any>({
              action: 'start',
              scope_tier: 'basic',
              redirect_uri: oauthRedirectUri(),
              return_origin: oauthReturnOrigin(),
            });
            if (retry?.auth_url) {
              const url = String(retry.auth_url);
              
              toast.message('מבקשים הרשאות בסיסיות מפייסבוק', {
                description: 'אשרו שוב את החיבור כדי להשלים את ההתחברות.',
              });
              if (openOAuthWindow(url)) return;
            }
          } catch {
            /* fall through to the manual path below */
          }
        }
        toast.error('חיבור עמוד הפייסבוק נכשל', { description: String(e?.message ?? 'החיבור לפייסבוק נכשל.') });
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



  // Popup / separate-tab result: the callback window already exchanged the code
  // and saved the page binding, so we only refresh the local state here.
  useEffect(() => {
    return onOAuthResult('facebook_page', (result) => {
      setConnecting(false);
      if (result.ok) {
        clearPendingOAuth();
        setManualOpen(false);
        toast.success('עמוד הפייסבוק חובר', { description: result.name || undefined });
        refreshBinding();
        refreshHealth();
        void probe(false).catch(() => undefined);
      } else if (result.reason === 'needs_page_selection') {
        toast.message('בחר את עמוד הפרסום', { description: 'לא הצלחנו לבחור עמוד אוטומטית.' });
        void loadPageOptions();
      } else {
        setManualOpen(true);
        toast.error('חיבור עמוד הפייסבוק נכשל', { description: result.reason || 'החיבור לפייסבוק נכשל.' });
      }
    });
  }, [probe, refreshBinding, refreshHealth, loadPageOptions]);

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

    if (outcome === 'choose') {
      strip();
      clearPendingOAuth();
      setConnecting(false);
      toast.message('בחר את עמוד הפרסום', { description: 'לא הצלחנו לבחור עמוד אוטומטית.' });
      void loadPageOptions();
      return;
    }

    if (outcome === 'error') {
      strip();
      clearPendingOAuth();
      setConnecting(false);
      const reason = params.get('fb_reason');
      setManualOpen(true);
      toast.error('חיבור עמוד הפייסבוק נכשל', { description: reason || 'החיבור לפייסבוק נכשל.' });
      return;
    }

    // Legacy stashed result (other providers / older sessions).
    const pending = takePendingOAuth(STATE_PREFIX);
    if (!pending) return;
    if (pending.error || !(pending.code || pending.accessToken)) {
      toast.error('חיבור עמוד הפייסבוק בוטל', {
        description: pending.errorDescription || pending.error || 'החיבור לפייסבוק נכשל.',
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
          redirect_uri: oauthRedirectUri(),
          return_origin: oauthReturnOrigin(),
        }),
        EXCHANGE_TIMEOUT_MS,
        'שירות החיבור לפייסבוק לא הגיב בזמן. נסה שוב.',
      );

      if (!res?.auth_url) throw new Error('לא הוחזרה כתובת אימות מפייסבוק');
      // Open in a popup / new tab. Assigning window.top.location throws a
      // sandbox permission error inside the preview iframe.
      const authUrl = String(res.auth_url);
      const opened = openOAuthWindow(authUrl);
      if (!opened) {
        setConnecting(false);
        toast.error('הדפדפן חסם את חלון ההתחברות', {
          description: 'אפשרו חלונות קופצים עבור האתר ונסו שוב.',
        });
      }
    } catch (e: any) {
      setConnecting(false);
      setLoading(false);

      setManualOpen(true);
      toast.error('לא ניתן לפתוח את חיבור פייסבוק', {
        description: `${String(e?.message ?? 'החיבור לפייסבוק נכשל.')} ניתן לחבר את העמוד ידנית באמצעות Page Access Token.`,
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
      requestExtensionGroups();

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


  // MULTI-ACCOUNT: every Page bound to THIS workspace (strictly isolated).
  const loadBindings = useCallback(async () => {
    try {
      const res = await callPageConnect<any>({ action: 'bindings' });
      setBindings(Array.isArray(res?.bindings) ? res.bindings : []);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    if (isConnected) void loadBindings();
    else setBindings([]);
  }, [isConnected, connectionEpoch, loadBindings]);

  const makeDefault = async (pageId: string) => {
    setSettingDefaultId(pageId);
    setBindings((prev) => prev.map((b) => ({ ...b, isDefault: b.id === pageId })));
    try {
      const res = await callPageConnect<any>({ action: 'set_default', page_id: pageId });
      if (!res?.ok) throw new Error(res?.error || 'שמירת עמוד ברירת המחדל נכשלה');
      refreshBinding();
      refreshHealth();
      toast.success('עמוד ברירת המחדל עודכן');
    } catch (e: any) {
      toast.error('עדכון נכשל', { description: e?.message });
      void loadBindings();
    } finally {
      setSettingDefaultId(null);
    }
  };

  const actionButtons = (
    <>
      {isConnected && (
        <Button
          variant="ghost"
          size="sm"
          onClick={disconnect}
          disabled={disconnecting}
          className="h-8 gap-1.5 text-[15px] text-destructive"
          aria-label="נתק את עמוד הפייסבוק"
        >
          {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
        </Button>
      )}
    </>
  );

  return (
    <Card key={connectionEpoch} ref={ref} dir="rtl" className="text-right">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-right">
          <Facebook className="h-5 w-5 text-primary" />
          <span>פייסבוק ואינסטגרם</span>
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
            </div>
            <Badge className="gap-1 rounded-full border-0 bg-emerald-600 px-3 py-1 text-[12px] font-bold text-white hover:bg-emerald-700">
              <CheckCircle2 className="h-4 w-4" strokeWidth={2.75} /> פעיל
            </Badge>
          </div>
        ) : null}

        {isConnected && (
          <div className="space-y-2 rounded-xl border p-3">
            <p className="text-[13px] font-semibold">חשבונות ועמודים מחוברים בסביבת העבודה</p>
            {bindings.length > 1 && (
              <p className="text-[12px] text-muted-foreground">בחרו את עמוד ברירת המחדל לפרסום.</p>
            )}
            <div className="space-y-1.5">
              {bindings.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => (b.isDefault ? undefined : void makeDefault(b.id))}
                  className={`flex w-full items-center gap-2 rounded-lg border p-2 text-right transition ${
                    b.isDefault ? 'border-emerald-300 bg-emerald-50/60' : 'hover:bg-muted/50'
                  }`}
                >
                  {b.picture ? (
                    <img src={b.picture} alt={b.name ?? b.id} className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                      <Facebook className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{b.name || b.id}</span>
                  {settingDefaultId === b.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : b.isDefault ? (
                    <Badge className="border-0 bg-emerald-600 text-[11px] text-white">ברירת מחדל</Badge>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">הגדר כברירת מחדל</span>
                  )}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-[12px]"
              onClick={() => (connecting ? setConnecting(false) : void connect())}
            >
              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Facebook className="h-3.5 w-3.5 text-[#1877F2]" />}
              {connecting ? 'בטל' : 'חבר חשבון או עמוד נוסף'}
            </Button>
          </div>
        )}

        {!isConnected && (
          <div className="rounded-xl border border-dashed p-3 space-y-2">
            {/* Clicking the spinning button cancels the pending attempt. */}
            <Button
              onClick={() => (connecting ? setConnecting(false) : void connect())}
              className="w-full gap-2 bg-[#1877F2] text-white hover:bg-[#1877F2]/90"
            >
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
              {connecting ? 'בטל חיבור' : 'חבר עמוד פייסבוק'}
            </Button>
            {pageOptions.length > 0 && (
              <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2">
                <p className="text-[14px] font-semibold">בחרו את עמוד הפרסום</p>
                {pageOptions.map((opt) => (
                  <Button
                    key={opt.id}
                    size="sm"
                    variant="outline"
                    className="w-full justify-between gap-2"
                    disabled={!!selectingPageId}
                    onClick={() => selectPage(opt.id)}
                  >
                    <span className="truncate">{opt.name || opt.id}</span>
                    {selectingPageId === opt.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {isConnected ? (
          <FacebookTargetsCard key={`targets-${connectionEpoch}`} actions={actionButtons} />
        ) : (
          <div className="flex flex-wrap items-center gap-2">{actionButtons}</div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={igHandle ? 'default' : 'secondary'} className="gap-1.5">
            <Instagram className="h-3.5 w-3.5" />
            {igHandle ? `אינסטגרם: @${igHandle}` : 'אינסטגרם לא מקושר'}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[15px]"
            onClick={() => setIgHelpOpen(true)}
          >
            <Instagram className="h-3.5 w-3.5" /> איך מחברים?
          </Button>
        </div>

        <Dialog open={igHelpOpen} onOpenChange={setIgHelpOpen}>
          <DialogContent dir="rtl" className="text-right sm:max-w-md">
            <DialogHeader className="text-right">
              <DialogTitle>חיבור אינסטגרם ב-3 צעדים</DialogTitle>
              <DialogDescription>
                אינסטגרם מתחבר דרך עמוד הפייסבוק — אין צורך בהתחברות נפרדת.
              </DialogDescription>
            </DialogHeader>
            <ol className="list-inside list-decimal space-y-1.5 text-[15px] text-muted-foreground">
              <li>ודא שחשבון האינסטגרם הוא חשבון מקצועי (Business או Creator).</li>
              <li>באפליקציית אינסטגרם: הגדרות ← קישור חשבונות ← פייסבוק, ובחר את עמוד הפייסבוק המחובר כאן.</li>
              <li>חזור לכאן — האינסטגרם יופיע מקושר אוטומטית.</li>
            </ol>
            <Button
              type="button"
              size="sm"
              className="h-8 text-[15px]"
              onClick={() => { setIgHelpOpen(false); void probe(true); }}
            >
              בדוק חיבור אינסטגרם
            </Button>
          </DialogContent>
        </Dialog>

        <Dialog open={tokenHelpOpen} onOpenChange={setTokenHelpOpen}>
          <DialogContent dir="rtl" className="text-right sm:max-w-md">
            <DialogHeader className="text-right">
              <DialogTitle>קבלת Page Access Token ב-4 צעדים</DialogTitle>
              <DialogDescription>הטוקן נשמר בצד השרת בלבד ומאפשר פרסום גם ללא אישור אפליקציה.</DialogDescription>
            </DialogHeader>
            <ol className="list-inside list-decimal space-y-1.5 text-[15px] text-muted-foreground">
              <li>פתחו את Graph API Explorer של Meta (developers.facebook.com/tools/explorer).</li>
              <li>בצד שמאל בחרו את האפליקציה שלכם, ולחצו "Generate Access Token".</li>
              <li>בתפריט "User or Page" בחרו את עמוד הפייסבוק שלכם — זה הטוקן של העמוד.</li>
              <li>העתיקו את הטוקן ואת מזהה העמוד (Page ID, מתחת לשם העמוד בפייסבוק) לשדות כאן ושמרו.</li>
            </ol>
            <Button
              type="button"
              size="sm"
              className="h-8 text-[15px]"
              onClick={() => window.open('https://developers.facebook.com/tools/explorer/', '_blank', 'noopener,noreferrer')}
            >
              פתחו את Graph API Explorer
            </Button>
          </DialogContent>
        </Dialog>

        {status && !status.connected && status.message && (
          <p className="text-[15px] text-destructive">{status.message}</p>
        )}

        {/* Manual token fallback for apps blocked in development/testing mode */}
        <div className="rounded-xl border">
          <button
            type="button"
            onClick={() => setManualOpen((v) => !v)}
            aria-expanded={manualOpen}
            className="flex w-full items-center justify-between gap-2 p-3 text-right"
          >
            <span className="flex items-center gap-2 text-[15px] font-medium">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              חיבור ידני באמצעות טוקן
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${manualOpen ? 'rotate-180' : ''}`} />
          </button>
          {manualOpen && (
            <div className="space-y-3 border-t p-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-[15px]"
                onClick={() => setTokenHelpOpen(true)}
              >
                <KeyRound className="h-4 w-4" /> איך משיגים טוקן?
              </Button>
              <div className="space-y-1.5">
                <Label htmlFor="meta-page-id" className="text-[15px]">Page ID</Label>
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
                <Label htmlFor="meta-page-token" className="text-[15px]">Page Access Token</Label>
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
      </CardContent>
    </Card>
  );
});

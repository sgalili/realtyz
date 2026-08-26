import { useEffect, useState } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { openOAuthWindow } from '@/lib/openOAuthWindow';
import { Facebook, Loader2, CheckCircle2, Unlink, AlertTriangle } from 'lucide-react';
import { clearPendingOAuth, oauthRedirectUri, oauthReturnOrigin, takePendingOAuth } from '@/lib/oauthRedirect';
import { useResetFacebookHealth } from '@/hooks/useFacebookHealth';


type Identity = {
  fb_user_id: string | null;
  fb_user_name: string | null;
  fb_avatar_url: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
  connected_at: string | null;
  last_import_at: string | null;
  last_error: string | null;
};

const STATE_PREFIX = 'facebook_personal:';

/**
 * Invoke the fb-personal-connect edge function with resilient error handling.
 */
async function callFbPersonal<T = any>(body: Record<string, unknown>): Promise<T> {
  let res: any = null;
  let err: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await supabase.functions.invoke('fb-personal-connect', { body });
    res = out.data;
    err = out.error;
    if (!err) break;
    await new Promise((r) => setTimeout(r, 600));
  }
  if (err) {
    const raw = String(err?.message ?? err);
    throw new Error(
      /failed to (send|fetch)/i.test(raw)
        ? 'לא ניתן להגיע לשירות החיבור לפייסבוק. נסה/י שוב בעוד רגע.'
        : raw,
    );
  }
  if (res && (res as any).error) throw new Error(String((res as any).error));
  return res as T;
}

/**
 * FacebookPersonalConnectCard — connects the workspace owner's PERSONAL
 * Facebook profile through the official Facebook Login flow.
 *
 * Group discovery is NOT done through the Graph API (Meta blocks
 * user_managed_groups for business configurations); groups are maintained
 * manually / by the browser extension in the Custom Groups directory.
 */
export const FacebookPersonalConnectCard = () => {
  const qc = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const resetFacebookHealth = useResetFacebookHealth();

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['fb-personal-connection'],
    retry: 1,
    queryFn: async () =>
      await callFbPersonal<{
        connected: boolean;
        identity: Identity | null;
        groups_count: number;
        missing_scopes?: string[];
        scope_advisory?: string | null;
      }>({
        action: 'status',
      }),
  });

  const connected = !!data?.connected;
  const identity = data?.identity ?? null;

  const completeExchange = async (code: string, redirectUri: string) => {
    try {
      const res = await callFbPersonal<any>({ action: 'exchange', code, redirect_uri: redirectUri });
      toast.success('פרופיל פייסבוק אישי חובר', {
        description: (res as any)?.identity?.fb_user_name ?? undefined,
      });
      await refetch();
      // Pull the groups right away so "סנכרן קבוצות" is not needed manually.
      void supabase.functions.invoke('fb-groups-import', { body: {} }).then(() => {
        qc.invalidateQueries({ queryKey: ['fb-user-groups'] });
        qc.invalidateQueries({ queryKey: ['custom-user-groups'] });
      });
      qc.invalidateQueries({ queryKey: ['facebook-health'] });
      qc.invalidateQueries({ queryKey: ['custom-user-groups'] });
    } catch (e: any) {
      toast.error('חיבור פייסבוק נכשל', { description: String(e?.message ?? 'החיבור לפייסבוק נכשל.') });
    } finally {
      setConnecting(false);
    }
  };

  // Full-page redirect return: /oauth/callback stashed the grant before
  // bouncing back here, so the exchange happens in the main app context.
  useEffect(() => {
    const pending = takePendingOAuth(STATE_PREFIX);
    if (!pending) return;
    if (pending.error || !pending.code) {
      toast.error('החיבור לפייסבוק בוטל', {
        description: pending.errorDescription || pending.error || 'החיבור לפייסבוק נכשל.',
      });
      return;
    }
    setConnecting(true);
    void completeExchange(pending.code, pending.redirectUri || oauthRedirectUri());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async (basic = false) => {
    setConnecting(true);
    try {
      clearPendingOAuth();
      // No client-side whitelist guard: the redirect_uri is pinned to the
      // production callback that is already authorized in the Meta app.

      const res = await callFbPersonal<any>({
        action: 'start',
        basic,
        redirect_uri: oauthRedirectUri(),
        return_origin: oauthReturnOrigin(),
      });
      const url = (res as any)?.auth_url;
      if (!url) throw new Error('לא הוחזרה כתובת אימות מפייסבוק');
      // Popup / new tab: window.top.location is blocked by the preview iframe sandbox.
      const authUrl = String(url);
      setPendingAuthUrl(authUrl);
      if (!openOAuthWindow(authUrl)) {
        setConnecting(false);
        toast.error('הדפדפן חסם את חלון ההתחברות', {
          description: 'לחצו על "פתחו את דף האישור" כדי להמשיך בלשונית חדשה.',
        });
      }
    } catch (e: any) {
      setConnecting(false);
      toast.error('לא ניתן לפתוח את חיבור פייסבוק', { description: String(e?.message ?? 'החיבור לפייסבוק נכשל.') });
    }
  };


  const disconnect = async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    try {
      // Use the authoritative Page disconnect, which atomically clears the Page
      // binding, personal token, imported groups and legacy Meta credentials.
      const { data: result, error } = await supabase.functions.invoke('meta-page-connect', {
        body: { action: 'disconnect' },
      });
      if (error) throw error;
      if ((result as any)?.error) throw new Error(String((result as any).error));
      clearPendingOAuth();
      await resetFacebookHealth();
      qc.setQueryData(['fb-personal-connection'], {
        connected: false,
        identity: null,
        groups_count: 0,
      });
      qc.removeQueries({ queryKey: ['fb-user-groups'] });
      qc.removeQueries({ queryKey: ['custom-user-groups'] });
      toast.success('פרופיל הפייסבוק נותק');
    } catch (e: any) {
      toast.error('ניתוק נכשל', { description: e?.message });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Card className="border-blue-200 bg-blue-50/40" dir="rtl">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
              <Facebook className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                פרופיל פייסבוק אישי
                {connected && (
                  <Badge variant="outline" className="gap-1 text-[10px] border-blue-300 text-blue-700">
                    <CheckCircle2 className="h-3 w-3" /> מחובר
                  </Badge>
                )}
              </CardTitle>
            </div>
          </div>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {connected && (
          <div className="flex items-center gap-3">
            {identity?.fb_avatar_url ? (
              <img
                src={identity.fb_avatar_url}
                alt={identity?.fb_user_name ?? 'פרופיל פייסבוק'}
                className="h-10 w-10 rounded-full object-cover border border-blue-200"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold">
                {(identity?.fb_user_name ?? 'FB').slice(0, 2)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{identity?.fb_user_name || 'פרופיל פייסבוק'}</p>
              {identity?.token_expires_at && (
                <p className="text-[11px] text-muted-foreground">
                  תוקף עד {new Date(identity.token_expires_at).toLocaleDateString('he-IL')}
                </p>
              )}
            </div>
          </div>
        )}

        {identity?.last_error && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800">{identity.last_error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          {connected && (
            <Button variant="ghost" size="sm" onClick={disconnect} disabled={disconnecting} className="gap-1 text-red-600 hover:text-red-700">
              {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />} ניתוק
            </Button>
          )}
          <Button size="sm" onClick={() => connect(false)} disabled={connecting} className="gap-1">
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
            {connected ? 'חיבור מחדש' : 'חיבור פרופיל פייסבוק'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default FacebookPersonalConnectCard;

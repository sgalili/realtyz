import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Facebook, Loader2, CheckCircle2, RefreshCw, Unlink, Users, AlertTriangle } from 'lucide-react';

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
 * Network-level failures (function cold start / not reachable) surface as a
 * readable Hebrew message instead of "Failed to send a request".
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
 * Facebook profile through the official Facebook Login flow, then imports the
 * groups they are a member of so campaigns can target them.
 *
 * The long-lived user access token is stored server-side only; the browser
 * never receives it.
 */
export const FacebookPersonalConnectCard = () => {
  const qc = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [importing, setImporting] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['fb-personal-connection'],
    retry: 1,
    queryFn: async () =>
      await callFbPersonal<{ connected: boolean; identity: Identity | null; groups_count: number }>({
        action: 'status',
      }),
  });


  const { data: groups } = useQuery({
    queryKey: ['fb-user-groups'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fb_user_groups')
        .select('group_id, group_name, group_icon, member_count, is_administrator')
        .order('group_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const connected = !!data?.connected;
  const identity = data?.identity ?? null;

  const runImport = async (silent = false) => {
    setImporting(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('fb-groups-import', { body: {} });
      if (error) throw error;
      if ((res as any)?.error) {
        toast.error('ייבוא הקבוצות לא הושלם', { description: (res as any).error });
      } else if (!silent) {
        toast.success(`יובאו ${(res as any)?.imported ?? 0} קבוצות פייסבוק`);
      }
      qc.invalidateQueries({ queryKey: ['fb-user-groups'] });
      refetch();
      try { sessionStorage.removeItem('rz-fb-groups-cache'); } catch { /* ignore */ }
    } catch (e: any) {
      toast.error('ייבוא הקבוצות נכשל', { description: e?.message });
    } finally {
      setImporting(false);
    }
  };

  // Receive the OAuth code from the popup and exchange it server-side.
  useEffect(() => {
    const handler = async (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const m: any = ev.data;
      if (!m || m.type !== 'realtyz-oauth-callback') return;
      if (!String(m.state || '').startsWith(STATE_PREFIX)) return;
      if (m.error) {
        setConnecting(false);
        toast.error('החיבור לפייסבוק בוטל', { description: m.errorDescription || m.error });
        return;
      }
      try {
        const { data: res, error } = await supabase.functions.invoke('fb-personal-connect', {
          body: {
            action: 'exchange',
            code: m.code,
            redirect_uri: `${window.location.origin}/oauth/callback`,
          },
        });
        if (error || (res as any)?.error) throw new Error((res as any)?.error || error?.message);
        toast.success('פרופיל פייסבוק אישי חובר', {
          description: (res as any)?.identity?.fb_user_name ?? undefined,
        });
        await refetch();
        await runImport(true);
      } catch (e: any) {
        toast.error('חיבור פייסבוק נכשל', { description: e?.message });
      } finally {
        setConnecting(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('fb-personal-connect', {
        body: { action: 'start', redirect_uri: `${window.location.origin}/oauth/callback` },
      });
      if (error || (res as any)?.error) throw new Error((res as any)?.error || error?.message);
      const url = (res as any)?.auth_url;
      if (!url) throw new Error('לא הוחזרה כתובת אימות מפייסבוק');
      window.open(url, 'realtyz-fb-personal-oauth', 'width=560,height=680');
    } catch (e: any) {
      setConnecting(false);
      toast.error('לא ניתן לפתוח את חיבור פייסבוק', { description: e?.message });
    }
  };

  const disconnect = async () => {
    try {
      await supabase.functions.invoke('fb-personal-connect', { body: { action: 'disconnect' } });
      toast.success('פרופיל הפייסבוק נותק');
      qc.invalidateQueries({ queryKey: ['fb-user-groups'] });
      refetch();
    } catch (e: any) {
      toast.error('ניתוק נכשל', { description: e?.message });
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
              <CardDescription className="text-xs">
                חיבור רשמי (Facebook Login) לייבוא הקבוצות שאת/ה חבר/ה בהן ולתזמון פרסום אליהן
              </CardDescription>
            </div>
          </div>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {connected ? (
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
              <p className="text-[11px] text-muted-foreground">
                {data?.groups_count ?? 0} קבוצות מיובאות
                {identity?.token_expires_at
                  ? ` · תוקף עד ${new Date(identity.token_expires_at).toLocaleDateString('he-IL')}`
                  : ''}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            התחברות מאובטחת דרך פייסבוק. אנחנו שומרים אך ורק את אסימון ההרשאה הרשמי (Access Token) בצד השרת,
            לעולם לא סיסמאות או קובצי Session.
          </p>
        )}

        {identity?.last_error && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800">{identity.last_error}</p>
          </div>
        )}

        {connected && (groups?.length ?? 0) > 0 && (
          <>
            <Separator />
            <div className="max-h-48 overflow-y-auto space-y-1.5 pl-1">
              {groups!.map((g) => (
                <div
                  key={g.group_id}
                  className="flex items-center gap-2 rounded-lg border border-blue-200 bg-white/70 px-2.5 py-1.5"
                >
                  {g.group_icon ? (
                    <img src={g.group_icon} alt="" className="h-6 w-6 rounded" />
                  ) : (
                    <Users className="h-4 w-4 text-blue-500" />
                  )}
                  <span className="text-xs flex-1 truncate">{g.group_name}</span>
                  {g.is_administrator && (
                    <Badge variant="outline" className="text-[9px] border-blue-300 text-blue-700">מנהל/ת</Badge>
                  )}
                  {g.member_count != null && (
                    <span className="text-[10px] text-muted-foreground">{g.member_count.toLocaleString('he-IL')}</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          {connected && (
            <Button variant="ghost" size="sm" onClick={disconnect} className="gap-1 text-red-600 hover:text-red-700">
              <Unlink className="h-4 w-4" /> ניתוק
            </Button>
          )}
          {connected && (
            <Button variant="outline" size="sm" onClick={() => runImport()} disabled={importing} className="gap-1">
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              ייבוא קבוצות
            </Button>
          )}
          <Button size="sm" onClick={connect} disabled={connecting} className="gap-1">
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />}
            {connected ? 'חיבור מחדש' : 'חיבור פרופיל פייסבוק'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default FacebookPersonalConnectCard;

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { OAUTH_AUTHORIZE_URLS, OAUTH_SCOPES } from '@/lib/socialAutomationService';

type GooglePlatform = 'gmail' | 'google_calendar';

/**
 * One-click Google connect row (Gmail / Google Calendar).
 * Opens the shared Google OAuth app in a popup and hands the code to the
 * `google-oauth-exchange` edge function, which stores the tokens in
 * `social_connections` for the workspace.
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

  useEffect(() => {
    const handler = async (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const m: any = ev.data;
      if (!m || m.type !== 'realtyz-oauth-callback') return;
      if (!String(m.state || '').startsWith(`${platform}:`)) return;
      if (m.error) {
        toast.error('החיבור בוטל', { description: m.errorDescription || m.error });
        return;
      }
      const tId = toast.loading('מחבר לחשבון Google...');
      try {
        const { data: resp, error } = await supabase.functions.invoke('google-oauth-exchange', {
          body: { platform, code: m.code, redirect_uri: `${window.location.origin}/oauth/callback` },
        });
        if (error || !(resp as any)?.ok) throw new Error((resp as any)?.error || error?.message || 'נכשל');
        toast.success('החיבור הושלם', { id: tId, description: (resp as any).identity?.email });
        refetch();
      } catch (e: any) {
        toast.error('החיבור נכשל', { id: tId, description: e?.message });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [platform, refetch]);

  const connect = async () => {
    const { data: shared } = await supabase
      .from('platform_oauth_apps')
      .select('client_id')
      .eq('platform', 'google')
      .maybeSingle();
    const clientId = (shared as any)?.client_id;
    if (!clientId) {
      toast.error('חיבור Google אינו מוגדר', { description: 'יש להגדיר את אפליקציית ה-OAuth המשותפת של Google.' });
      return;
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${window.location.origin}/oauth/callback`,
      response_type: 'code',
      scope: OAUTH_SCOPES[platform].join(' '),
      access_type: 'offline',
      prompt: 'consent select_account',
      include_granted_scopes: 'true',
      state: `${platform}:${crypto.randomUUID()}`,
    });
    window.open(`${OAUTH_AUTHORIZE_URLS[platform]}?${params}`, 'realtyz-google-oauth', 'width=520,height=640');
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
    </div>
  );
}

export default GoogleServiceConnectCard;

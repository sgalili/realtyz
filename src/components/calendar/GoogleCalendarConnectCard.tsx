import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { OAUTH_AUTHORIZE_URLS, OAUTH_SCOPES } from '@/lib/socialAutomationService';

const PLATFORM = 'google_calendar';

export function GoogleCalendarConnectCard() {
  const { data, refetch } = useQuery({
    queryKey: ['google-calendar-conn'],
    queryFn: async () => {
      const { data } = await supabase
        .from('social_connections')
        .select('id, is_connected, credentials, last_test_message')
        .eq('platform', PLATFORM)
        .maybeSingle();
      return data;
    },
  });

  const identity = (data?.credentials as any)?.verified_identity;
  const connected = !!data?.is_connected;

  useEffect(() => {
    const handler = async (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const m = ev.data;
      if (!m || m.type !== 'realtyz-oauth-callback') return;
      if (!String(m.state || '').startsWith(`${PLATFORM}:`)) return;
      if (m.error) { toast.error('Connect cancelled', { description: m.errorDescription || m.error }); return; }
      const tId = toast.loading('Linking Google Calendar...');
      try {
        const { data: resp, error } = await supabase.functions.invoke('google-oauth-exchange', {
          body: { platform: PLATFORM, code: m.code, redirect_uri: `${window.location.origin}/oauth/callback` },
        });
        if (error || !resp?.ok) throw new Error(resp?.error || error?.message || 'Failed');
        toast.success('Calendar connected', { id: tId, description: resp.identity?.email });
        refetch();
      } catch (e: any) {
        toast.error('Connect failed', { id: tId, description: e?.message });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [refetch]);

  function connect() {
    // Use shared Google OAuth app (server-side fallback) — no client_id needed in browser
    // We still need to launch the popup. Try to get client_id from platform_oauth_apps via a small RPC-less query.
    (async () => {
      const { data: shared } = await supabase
        .from('platform_oauth_apps')
        .select('client_id')
        .eq('platform', 'google')
        .maybeSingle();
      const clientId = shared?.client_id;
      if (!clientId) {
        toast.error('Google OAuth not configured', { description: 'Ask the workspace admin to set the shared Google OAuth app.' });
        return;
      }
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `${window.location.origin}/oauth/callback`,
        response_type: 'code',
        scope: OAUTH_SCOPES[PLATFORM].join(' '),
        access_type: 'offline',
        prompt: 'consent select_account',
        include_granted_scopes: 'true',
        state: `${PLATFORM}:${crypto.randomUUID()}`,
      });
      const url = `${OAUTH_AUTHORIZE_URLS[PLATFORM]}?${params}`;
      const w = 520, h = 640;
      window.open(url, 'realtyz-cal-oauth', `width=${w},height=${h}`);
    })();
  }

  return (
    <Card className="p-4 space-y-3" dir="ltr">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Google Calendar</h3>
        {connected && <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1 text-success" />Connected</Badge>}
      </div>
      {connected ? (
        <p className="text-xs text-muted-foreground">
          {identity?.email} • Calendar: {identity?.calendar_summary || 'Primary'} ({identity?.timezone})
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Connect your Google Calendar so the AI can suggest free slots and auto-book meetings.
        </p>
      )}
      <Button size="sm" onClick={connect} variant={connected ? 'outline' : 'default'}>
        {connected ? 'Reconnect' : 'Connect Google Calendar'}
      </Button>
    </Card>
  );
}

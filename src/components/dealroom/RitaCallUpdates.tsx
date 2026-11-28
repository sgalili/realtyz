import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useWorkspace } from '@/hooks/useWorkspace';
import { supabase } from '@/integrations/supabase/client';
import { removeChannelSafe } from '@/lib/safeRealtime';

const CALL_QUERY_KEYS = ['rita-profile-calls', 'rita-lead-calls', 'leads-infinite', 'lead-single', 'deal-room-leads', 'lead-messages', 'incoming-leads-count', 'leads-total', 'admin-profiles', 'broker-outreach', 'broker-contact-queue'];

/** A single private, data-free doorbell, mounted once per account/workspace. */
export function RitaCallUpdates() {
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!user || isDemoMode) return;
    let alive = true;
    let subscribed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (!alive || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (alive) CALL_QUERY_KEYS.forEach(key => { void queryClient.invalidateQueries({ queryKey: [key] }); });
      }, 200);
    };
    const channel = supabase.channel(`rita-calls:${user.id}`, { config: { private: true } })
      .on('broadcast', { event: 'call-completed' }, refresh)
      .subscribe(status => {
        if (!alive || status !== 'SUBSCRIBED') return;
        if (subscribed) refresh();
        else {
          const stale = queryClient.getQueryCache().getAll().some(query =>
            CALL_QUERY_KEYS.includes(String(query.queryKey[0])) && query.state.fetchStatus !== 'fetching' && Date.now() - query.state.dataUpdatedAt > 10000);
          if (stale) refresh();
        }
        subscribed = true;
      });
    return () => { alive = false; if (timer) clearTimeout(timer); removeChannelSafe(channel); };
  }, [user?.id, activeWorkspaceId, isDemoMode, queryClient]);
  return null;
}
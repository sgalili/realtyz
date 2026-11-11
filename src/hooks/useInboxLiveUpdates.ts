import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Private, data-free notifications only: message/lead rows stay out of Realtime.
export function useInboxLiveUpdates(userId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      for (const key of ['inbox-leads', 'last-messages', 'chat-messages', 'lead-channels', 'orphan-phone-threads', 'community-threads', 'community-messages', 'community-groups', 'community-roster', 'community-group-messages', 'rita-conversations']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    };
    const channel = supabase.channel(`inbox-events:${userId}`, { config: { private: true } })
      .on('broadcast', { event: 'changed' }, refresh)
      .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
    return () => { void supabase.removeChannel(channel); };
  }, [userId, queryClient]);
}
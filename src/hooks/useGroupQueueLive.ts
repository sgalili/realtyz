import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeChannel, removeChannelSafe } from '@/lib/safeRealtime';

// Share one channel and one coalesced notification per active workspace.
const live = new Map<string, {
  listeners: Set<() => void>;
  channel: ReturnType<typeof supabase.channel>;
  timer?: ReturnType<typeof setTimeout>;
}>();

export function useGroupQueueLive(owner: string | null | undefined, onChange: () => void) {
  const callback = useRef(onChange);
  callback.current = onChange;
  useEffect(() => {
    if (!owner) return;
    let entry = live.get(owner);
    if (!entry) {
      const notify = () => {
          const current = live.get(owner);
          if (!current || current.timer) return;
          current.timer = setTimeout(() => {
            current.timer = undefined;
            current.listeners.forEach((notify) => notify());
          }, 100);
        };
      const channel = safeChannel(`group-queue-${owner}`);
      for (const table of ['campaign_activity_queue', 'fb_user_groups', 'fb_cloud_sessions']) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `workspace_owner_id=eq.${owner}` }, notify);
      }
      channel.subscribe();
      entry = { channel, listeners: new Set() };
      live.set(owner, entry);
    }
    const listener = () => callback.current();
    entry.listeners.add(listener);
    return () => {
      const current = live.get(owner);
      if (!current) return;
      current.listeners.delete(listener);
      if (current.listeners.size === 0) {
        clearTimeout(current.timer);
        removeChannelSafe(current.channel);
        live.delete(owner);
      }
    };
  }, [owner]);
}
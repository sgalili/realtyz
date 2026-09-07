import { useEffect } from 'react';
import { safeChannel, removeChannelSafe } from '@/lib/safeRealtime';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

/**
 * Subscribes to Supabase Realtime changes on a table and invalidates
 * the relevant React Query cache keys so the UI auto-updates.
 */
export function useRealtimeSubscription(
  table: string,
  queryKeys: string[][],
  filter?: { column: string; value: string }
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channelName = filter
      ? `${table}-${filter.column}-${filter.value}`
      : `${table}-changes`;

    let channel = safeChannel(channelName)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table,
          ...(filter ? { filter: `${filter.column}=eq.${filter.value}` } : {}),
        },
        (_payload: any) => {
          // Invalidate all related query keys so React Query refetches
          queryKeys.forEach((key) => {
            queryClient.invalidateQueries({ queryKey: key });
          });
        }
      )
      .subscribe();

    return () => {
      removeChannelSafe(channel);
    };
  }, [table, JSON.stringify(queryKeys), filter?.column, filter?.value, queryClient]);
}

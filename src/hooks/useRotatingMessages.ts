import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pushRealtimeAuth, removeChannelSafe, safeChannel } from '@/lib/safeRealtime';
import type { RotatingMessage, RotatingMessageAudience } from '@/lib/rotatingMessages';

const db = supabase as any;
export const ROTATING_MESSAGES_QUERY_KEY = ['rotating-messages'] as const;

function useRotatingMessagesLive() {
  const queryClient = useQueryClient();

  useEffect(() => {
    void pushRealtimeAuth();
    const channel = safeChannel(`rotating-messages-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rotating_messages' },
        () => void queryClient.invalidateQueries({ queryKey: ROTATING_MESSAGES_QUERY_KEY }),
      )
      .subscribe();

    return () => removeChannelSafe(channel);
  }, [queryClient]);
}

export function useRotatingMessages(audience: RotatingMessageAudience, enabled = true) {
  useRotatingMessagesLive();

  return useQuery<RotatingMessage[]>({
    queryKey: [...ROTATING_MESSAGES_QUERY_KEY, 'active', audience],
    enabled,
    queryFn: async () => {
      const { data, error } = await db
        .from('rotating_messages')
        .select('id, role_key, message_text, sort_order, is_active, created_at')
        .eq('role_key', audience)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RotatingMessage[];
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useAllRotatingMessages(enabled: boolean) {
  useRotatingMessagesLive();

  return useQuery<RotatingMessage[]>({
    queryKey: [...ROTATING_MESSAGES_QUERY_KEY, 'admin'],
    enabled,
    queryFn: async () => {
      const { data, error } = await db
        .from('rotating_messages')
        .select('id, role_key, message_text, sort_order, is_active, created_at')
        .order('role_key', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RotatingMessage[];
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

/** Fail closed; never read credentials or inherit another workspace's connection. */
export function useHomelyConnection() {
  const workspaceId = useActiveWorkspaceOwnerId();
  const query = useQuery({
    queryKey: ['homely-connection', workspaceId],
    enabled: !!workspaceId,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!workspaceId) return false;
      const { data, error } = await supabase.from('homely_broker_credentials')
        .select('connection_status').eq('user_id', workspaceId).maybeSingle();
      if (error) return false;
      return data?.connection_status === 'ok' || data?.connection_status === 'manually_verified';
    },
  });
  return { connected: query.data === true, isLoading: query.isLoading };
}
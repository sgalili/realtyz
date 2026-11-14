import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';

export type DeveloperSubscriptionStatus = {
  active: boolean;
  expires_at: string | null;
  plan_code: 'developer_monthly';
  workspace_owner_id: string;
};

export function useDeveloperSubscription(enabled = true) {
  const { user } = useAuth();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  return useQuery({
    queryKey: ['developer-subscription', user?.id, activeWorkspaceId],
    enabled: enabled && !!user?.id && !!activeWorkspaceId && !workspaceLoading,
    staleTime: 5000,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_developer_subscription_status');
      if (error) throw error;
      return data as unknown as DeveloperSubscriptionStatus;
    },
  });
}

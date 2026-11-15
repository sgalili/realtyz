import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { propertyPageAccess } from '@/lib/propertyPageAccess';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

export function usePropertyPageAccess() {
  const { user, loading: authLoading } = useAuth();
  const ownerId = useActiveWorkspaceOwnerId();
  const role = useUserRole();
  const brokerRole = role.roles.some(value => ['managing_broker', 'lead_agent', 'agent'].includes(value));
  const license = useQuery({
    queryKey: ['property-page-license', ownerId],
    enabled: !!ownerId && brokerRole && !role.loading && !role.error,
    queryFn: async () => {
      if (!ownerId) return false;
      const { data, error } = await supabase.rpc('partner_can_view_closing', { _user_id: ownerId });
      if (error) throw error;
      return data === true;
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    retry: false,
  });
  const loading = authLoading || (!!user && (role.loading || !role.fetched || (brokerRole && license.isPending && !license.isError)));
  const ready = !!user && !!ownerId && !loading && !role.error;
  return { ...propertyPageAccess(role.roles, !license.isError && license.data === true, ready), loading };
}
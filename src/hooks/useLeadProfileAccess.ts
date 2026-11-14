import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

export function useLeadProfileAccess(leadId: string | null | undefined) {
  const { user } = useAuth();
  const workspace = useActiveWorkspaceOwnerId();
  return useQuery({
    queryKey: ['lead-profile-access', user?.id, workspace, leadId],
    enabled: !!user && !!leadId && !leadId.startsWith('phone:'),
    queryFn: async () => {
      if (!leadId) return null;
      const { data, error } = await supabase.rpc('lead_profile_access', { _lead: leadId });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    staleTime: 0,
  });
}
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useWorkspaceOwnerRoles } from '@/hooks/useWorkspaceFeatures';
import { supabase } from '@/integrations/supabase/client';
import { accountIdentity } from '@/lib/accountMode';

export function useAccountIdentity() {
  const { user } = useAuth();
  const { activeWorkspaceId, loading } = useWorkspace();
  const { roles } = useUserRole();
  const ownerRoles = useWorkspaceOwnerRoles();
  const owner = activeWorkspaceId ?? user?.id;
  const { data } = useQuery({
    queryKey: ['primary-user-type', owner], enabled: !!owner && !loading,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('primary_user_type').eq('id', owner ?? '').maybeSingle();
      if (error) throw error;
      return data?.primary_user_type ?? null;
    },
  });
  return accountIdentity(ownerRoles.length ? ownerRoles : owner === user?.id ? roles : [], data);
}
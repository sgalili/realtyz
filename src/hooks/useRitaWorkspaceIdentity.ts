import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { supabase } from '@/integrations/supabase/client';
import { profileGender } from '../../supabase/functions/_shared/personalLanguage';

/** Rita never borrows the visitor's identity or cached workspace branding. */
export function useRitaWorkspaceIdentity() {
  const { user } = useAuth();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const ownerId = workspaceLoading ? null : activeWorkspaceId;
  const scope = user?.id && ownerId ? `${user.id}:${ownerId}` : '';
  const query = useQuery({
    queryKey: ['rita-workspace-identity', user?.id, ownerId],
    enabled: !!scope,
    staleTime: 0,
    gcTime: 0,
    queryFn: async ({ signal }) => {
      if (!ownerId) return null;
      const [profile, roles] = await Promise.all([
        supabase.from('profiles').select('id, full_name, gender').eq('id', ownerId).abortSignal(signal).maybeSingle(),
        supabase.rpc('get_workspace_owner_roles', { _owner: ownerId }).abortSignal(signal),
      ]);
      if (profile.error) throw profile.error;
      if (roles.error) throw roles.error;
      return { ownerId, profile: profile.data, roles: roles.data ?? [] };
    },
  });
  const identity = query.data?.ownerId === ownerId ? query.data : null;
  const name = identity?.profile?.full_name ?? '';
  return {
    scope, ownerId, name,
    firstName: name.trim().split(/\s+/)[0] ?? '',
    gender: profileGender(identity?.profile?.gender),
    roles: (identity?.roles ?? []) as string[],
    ready: !!scope && !!identity && !query.isError,
    error: query.isError,
  };
}
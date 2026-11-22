import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { workspaceFeatures, type WorkspaceFeatures } from '@/config/workspaceMode';
import { useActiveWorkspaceOwnerId, useWorkspace } from '@/hooks/useWorkspace';
import type { AppRole } from '@/hooks/useUserRole';
import { usePublicWorkspace } from '@/components/demo/PublicWorkspaceProvider';

/**
 * Roles of the ACTIVE workspace owner (not the signed-in viewer). The product
 * experience follows the owner: entering a developer's workspace shows the
 * developer product even to a super_admin visitor.
 */
export function useWorkspaceOwnerRoles(): AppRole[] {
  const simulation = usePublicWorkspace();
  const ownerId = useActiveWorkspaceOwnerId();
  const { loading, activeWorkspaceId } = useWorkspace();
  const { data } = useQuery({
    queryKey: ['workspace-owner-roles', ownerId],
    enabled: !!ownerId && !!activeWorkspaceId && !loading && !simulation,
    queryFn: async () => {
      // Cast: generated types lag behind the migration that added this RPC.
      const { data, error } = await (supabase.rpc as CallableFunction)('get_workspace_owner_roles', { _owner: ownerId }) as { data: string[] | null; error: unknown };
      if (error) return [] as AppRole[];
      return (data ?? []) as AppRole[];
    },
    staleTime: 60_000,
  });
  return simulation ? simulation.roles as AppRole[] : !loading && activeWorkspaceId ? data ?? [] : [];
}

/**
 * UI feature set of the ACTIVE workspace. Re-computes the moment the user
 * switches workspaces, so menus, dashboards and routes flip instantly.
 */
export function useWorkspaceFeatures(): WorkspaceFeatures {
  const ownerId = useActiveWorkspaceOwnerId();
  const ownerRoles = useWorkspaceOwnerRoles();
  return useMemo(() => workspaceFeatures(ownerId, ownerRoles), [ownerId, ownerRoles]);
}

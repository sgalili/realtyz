import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { workspaceFeatures, type WorkspaceFeatures } from '@/config/workspaceMode';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import type { AppRole } from '@/hooks/useUserRole';

/**
 * Roles of the ACTIVE workspace owner (not the signed-in viewer). The product
 * experience follows the owner: entering a developer's workspace shows the
 * developer product even to a super_admin visitor.
 */
export function useWorkspaceOwnerRoles(): AppRole[] {
  const ownerId = useActiveWorkspaceOwnerId();
  const { data } = useQuery({
    queryKey: ['workspace-owner-roles', ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_workspace_owner_roles', { _owner: ownerId! });
      if (error) return [] as AppRole[];
      return (data ?? []) as AppRole[];
    },
    staleTime: 60_000,
  });
  return data ?? [];
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

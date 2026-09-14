import { useMemo } from 'react';
import { workspaceFeatures, type WorkspaceFeatures } from '@/config/workspaceMode';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

/**
 * UI feature set of the ACTIVE workspace. Re-computes the moment the user
 * switches workspaces, so menus, dashboards and routes flip instantly.
 */
export function useWorkspaceFeatures(): WorkspaceFeatures {
  const ownerId = useActiveWorkspaceOwnerId();
  return useMemo(() => workspaceFeatures(ownerId), [ownerId]);
}

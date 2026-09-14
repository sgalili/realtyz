import { RITA_WORKSPACE_OWNER_ID } from '@/config/workspaceMode';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

/**
 * True only while the ACTIVE workspace is Rita's marketing workspace.
 * Used to hide deal/partner surfaces and swap the dashboard for the
 * agent-acquisition view. Never derived from the signed-in user alone.
 */
export function useIsRitaWorkspace(): boolean {
  const ownerId = useActiveWorkspaceOwnerId();
  return ownerId === RITA_WORKSPACE_OWNER_ID;
}

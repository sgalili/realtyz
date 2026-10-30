import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { getCloudSessionState, type CloudSessionState } from '@/lib/cloudSession';

export const CLOUD_SESSION_KEY = 'cloud-session-state';

/**
 * React Query view of the workspace's cloud Facebook connection. This is the
 * cloud-first proof of a live connection: the page chooser and every cloud
 * publishing control read it, so nothing is offered before the session vault
 * actually holds an unexpired, error-free session for the active workspace.
 */
export function useCloudSessionState() {
  const owner = useActiveWorkspaceOwnerId();
  const qc = useQueryClient();

  const query = useQuery<CloudSessionState>({
    queryKey: [CLOUD_SESSION_KEY, owner],
    enabled: !!owner,
    staleTime: 30_000,
    queryFn: () => getCloudSessionState(),
  });

  // A connect / disconnect anywhere in the app re-reads the vault immediately.
  useEffect(() => {
    const invalidate = () => { void qc.invalidateQueries({ queryKey: [CLOUD_SESSION_KEY] }); };
    window.addEventListener('realtyz:facebook-connection-changed', invalidate);
    return () => window.removeEventListener('realtyz:facebook-connection-changed', invalidate);
  }, [qc]);

  return query;
}

/** True only when the cloud vault proves an active, unexpired session. */
export function useCloudSessionConnected() {
  const { data } = useCloudSessionState();
  return data?.active === true;
}

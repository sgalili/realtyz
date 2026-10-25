import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

/**
 * Returns live row counts for sidebar nav badges.
 * RLS already scopes results to the current workspace/user, so plain
 * `head + count: 'exact'` queries are workspace-isolated by design.
 */
export function useSidebarCounts() {
  const { user } = useAuth();
  const workspaceOwnerId = useActiveWorkspaceOwnerId();

  return useQuery({
    queryKey: ['sidebar-counts', workspaceOwnerId ?? 'anon'],
    enabled: !!user && !!workspaceOwnerId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // One workspace-authorized server aggregation instead of nine client reads.
      const empty = { leads: 0, listings: 0, chats: 0, deals: 0, campaigns: 0, tasks: 0, sharedListings: 0, invitations: 0, projects: 0 };
      const { data, error } = await (supabase as any).rpc('get_sidebar_counts', { _ws: workspaceOwnerId });
      if (error || !data) return empty;
      return { ...empty, ...(data as Record<string, number>) };
    },
  });
}

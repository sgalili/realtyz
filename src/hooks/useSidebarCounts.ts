import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';

/**
 * Returns live row counts for sidebar nav badges.
 * RLS already scopes results to the current workspace/user, so plain
 * `head + count: 'exact'` queries are workspace-isolated by design.
 */
export function useSidebarCounts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['sidebar-counts', user?.id ?? 'anon'],
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const safeCount = async (
        table: string,
        build?: (q: any) => any,
      ): Promise<number> => {
        try {
          let q: any = supabase.from(table as any).select('*', { count: 'exact', head: true });
          if (build) q = build(q);
          const { count, error } = await q;
          if (error) return 0;
          return count ?? 0;
        } catch {
          return 0;
        }
      };

      const [leads, listings, chats, deals, campaigns] = await Promise.all([
        safeCount('leads'),
        safeCount('listings'),
        safeCount('messages', (q) => q.eq('is_read', false)),
        safeCount('leads', (q) => q.in('lead_stage', ['new', 'contacted', 'qualified', 'negotiation', 'offer'])),
        safeCount('campaign_logs'),
      ]);

      return { leads, listings, chats, deals, campaigns };
    },
  });
}

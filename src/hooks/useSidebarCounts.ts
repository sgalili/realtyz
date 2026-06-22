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

      // Campaign count must match the published-feed grouping: one card per
      // (campaign_name + channel + created_at) tuple. A raw row count would
      // over-report (e.g. 10 rows that collapse to 8 cards).
      const groupedCampaignCount = async (): Promise<number> => {
        try {
          const { data, error } = await (supabase as any)
            .from('campaign_logs')
            .select('campaign_name, channel, created_at')
            .eq('is_archived', false)
            .order('created_at', { ascending: false })
            .limit(500);
          if (error || !Array.isArray(data)) return 0;
          const seen = new Set<string>();
          for (const r of data) {
            seen.add(`${r.campaign_name}|${r.channel}|${r.created_at}`);
          }
          return seen.size;
        } catch {
          return 0;
        }
      };

      const [leads, listings, chats, deals, campaigns] = await Promise.all([
        safeCount('leads'),
        safeCount('listings'),
        safeCount('messages'),
        safeCount('leads', (q) => q.not('lead_stage', 'is', null)),
        groupedCampaignCount(),
      ]);

      return { leads, listings, chats, deals, campaigns };
    },
  });
}

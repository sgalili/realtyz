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
      // (campaign_name + channel + created_at) tuple, PLUS any native Facebook
      // posts injected by /campaigns. The published feed writes its final
      // merged count to sessionStorage so the sidebar mirrors what the user
      // actually sees on /campaigns (DB campaigns + native FB posts), without
      // re-fetching Ayrshare from the sidebar.
      const groupedCampaignCount = async (): Promise<number> => {
        try {
          const cached = sessionStorage.getItem('realtyz.campaigns.total_count');
          const parsed = cached ? Number(cached) : NaN;
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        } catch { /* no-op */ }
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


      // Chats = distinct leads that have at least one row in `messages`.
      // We never want to mirror the contacts/leads table length here.
      const distinctChatLeads = async (): Promise<number> => {
        try {
          const { data, error } = await (supabase as any)
            .from('messages')
            .select('lead_id')
            .not('lead_id', 'is', null)
            .limit(5000);
          if (error || !Array.isArray(data)) return 0;
          const seen = new Set<string>();
          for (const r of data) if (r.lead_id) seen.add(r.lead_id);
          return seen.size;
        } catch { return 0; }
      };

      // Deals = leads whose pipeline stage has progressed past "new_lead".
      // A raw leads count would mirror the contacts table — explicitly excluded.
      const activeDealsCount = async (): Promise<number> => {
        return safeCount('leads', (q) =>
          q.not('lead_stage', 'is', null).neq('lead_stage', 'new_lead'),
        );
      };

      const [leads, listings, chats, deals, campaigns] = await Promise.all([
        safeCount('leads'),
        safeCount('listings'),
        distinctChatLeads(),
        activeDealsCount(),
        groupedCampaignCount(),
      ]);

      return { leads, listings, chats, deals, campaigns };

    },
  });
}

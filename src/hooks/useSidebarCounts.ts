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
      // (campaign_name + channel + created_at) tuple. Native Facebook posts are
      // now permanently imported into campaign_logs, so never trust a stale
      // sessionStorage value here — the database is the source of truth.
      const groupedCampaignCount = async (): Promise<number> => {
        try {
          const { data, error } = await (supabase as any)
            .from('campaign_logs')
            .select('campaign_name, channel, created_at')
            .eq('is_archived', false)
            .order('created_at', { ascending: false })
            .limit(1000);
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

      // Properties badge = Yad2 inventory (sale + rent) published in the last
      // 7 days inside the workspace territory only.
      const WS_CITIES = ['הרצליה', 'רמת השרון'];
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const yad2FreshCount = async (): Promise<number> => {
        return safeCount('listings', (q) =>
          q
            .ilike('source', '%yad2%')
            .gte('created_at', since)
            .in('city', WS_CITIES),
        );
      };

      const [leads, listings, chats, deals, campaigns] = await Promise.all([
        safeCount('leads'),
        yad2FreshCount(),
        distinctChatLeads(),
        activeDealsCount(),
        groupedCampaignCount(),
      ]);

      return { leads, listings, chats, deals, campaigns };


    },
  });
}

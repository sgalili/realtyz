import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ListingPublisher = { name: string; logo: string | null; userName: string | null };

/** Publisher workspace name + logo per listing id (safe cross-workspace lookup). */
export function useListingPublishers(listingIds: string[]) {
  const ids = [...new Set(listingIds)].sort();
  return useQuery({
    queryKey: ["listing-publishers-v2", ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_listing_publishers", { _listing_ids: ids });
      if (error) throw error;
      const map = new Map<string, ListingPublisher>();
      for (const row of (data ?? []) as any[]) {
        map.set(row.listing_id, { name: row.publisher_name, logo: row.publisher_logo, userName: row.publisher_user_name ?? null });
      }
      return map;
    },
  });
}

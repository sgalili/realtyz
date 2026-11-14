import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';

export type ListingPublisher = { name: string; logo: string | null; userName: string | null; officeUserId: string | null; userId: string | null };

/** Publisher workspace name + logo per listing id (safe cross-workspace lookup). */
export function useListingPublishers(listingIds: string[]) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const ids = [...new Set(listingIds)].sort();
  return useQuery({
    queryKey: ["listing-publishers-v3", user?.id, activeWorkspaceId, ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_listing_publishers", { _listing_ids: ids });
      if (error) throw error;
      const { data: authorizedRows } = await supabase.from('listings').select('id,user_id,workspace_owner_id').in('id', ids);
      const identities = new Map((authorizedRows ?? []).map(row => [row.id, row]));
      const map = new Map<string, ListingPublisher>();
      for (const row of (data ?? []) as any[]) {
        const identity = identities.get(row.listing_id);
        map.set(row.listing_id, { name: row.publisher_name, logo: row.publisher_logo, userName: row.publisher_user_name ?? null, officeUserId: identity ? row.workspace_owner_id : null, userId: identity?.user_id ?? identity?.workspace_owner_id ?? null });
      }
      return map;
    },
  });
}

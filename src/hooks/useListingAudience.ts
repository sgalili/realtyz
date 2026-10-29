import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAffiliateLicense } from '@/hooks/useAffiliateLicense';
import { supabase } from '@/integrations/supabase/client';
import { visibleToListingAudience, type RewardPresence } from '@/lib/listingAudience';

/** Account lists reuse public-safe presence flags; no commission amounts are requested or inferred. */
export function useListingAudience(listingIds: string[]) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { level4Unlocked } = useAffiliateLicense();
  const ids = [...new Set(listingIds)].sort();
  const query = useQuery({
    queryKey: ['listing-audience', user?.id, activeWorkspaceId, ids],
    enabled: !!user && ids.length > 0 && !level4Unlocked,
    staleTime: 30_000,
    queryFn: async () => {
      const hidden: string[] = [];
      for (let offset = 0; offset < ids.length; offset += 8) {
        await Promise.all(ids.slice(offset, offset + 8).map(async id => {
          const { data, error } = await supabase.functions.invoke(`public-listing-view?id=${encodeURIComponent(id)}`, { method: 'GET' });
          if (error) throw error;
          const rewards = data?.property?.reward_types as RewardPresence | undefined;
          if (!visibleToListingAudience(rewards, true, false)) hidden.push(id);
        }));
      }
      return hidden;
    },
  });
  const hidden = new Set(level4Unlocked ? [] : query.data ?? []);
  return { isVisible: (id: string) => !hidden.has(id), isLoading: !level4Unlocked && query.isLoading };
}
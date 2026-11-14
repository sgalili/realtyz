import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';

export function useListingProfileTargets(listingId?: string | null) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  return useQuery({
    queryKey: ['listing-profile-target', user?.id, activeWorkspaceId, listingId],
    enabled: !!user && !!listingId && /^[0-9a-f-]{36}$/i.test(listingId),
    staleTime: 300_000,
    queryFn: async () => {
      if (!listingId) return null;
      const { data, error } = await supabase.rpc('get_listing_profile_targets', { _listing_ids: [listingId] });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}
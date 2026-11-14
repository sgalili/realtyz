import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { profileGender } from '@/i18n/personalLanguage';

/** Uses the existing public-card authorization; never reads peer profiles directly. */
export function useCommunityGenders(ids: string[]) {
  const { user } = useAuth();
  const targets = [...new Set(ids)].sort().slice(0, 200);
  return useQuery({
    queryKey: ['community-genders', user?.id, targets], enabled: !!user && targets.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_profile_genders', { _ids: targets });
      if (error) throw error;
      return new Map((data ?? []).map(row => [row.id, profileGender(row.gender)]));
    },
  });
}
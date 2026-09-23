import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useDeleteListings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (listingIds: string[]) => {
      const ids = Array.from(new Set(listingIds.filter(Boolean)));
      if (!ids.length) throw new Error('לא נבחרו נכסים למחיקה');

      const { data, error } = await supabase
        .from('listings')
        .delete()
        .in('id', ids)
        .select('id');

      if (error) throw error;
      if ((data?.length ?? 0) !== ids.length) {
        throw new Error('חלק מהנכסים לא נמחקו. ייתכן שאין הרשאה למחוק אותם.');
      }
      return ids;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['properties-search'] });
      queryClient.invalidateQueries({ queryKey: ['broker-affiliate-listings'] });
      queryClient.invalidateQueries({ queryKey: ['affiliate-configs'] });
      queryClient.invalidateQueries({ queryKey: ['affiliate-marketplace'] });
      queryClient.invalidateQueries({ queryKey: ['affiliate-referral-listings'] });
    },
  });
}
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const MONTHLY_FREE_CREDITS_DEFAULT = 20;

/** Super Admin-configured monthly free credits; the server grant reads the same value. */
export function useMonthlyFreeCredits() {
  return useQuery({
    queryKey: ['monthly-free-credits'],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.from('platform_system_settings').select('monthly_free_credits').eq('id', true).maybeSingle();
      if (error) throw error;
      return Number(data?.monthly_free_credits ?? MONTHLY_FREE_CREDITS_DEFAULT);
    },
    staleTime: 60_000,
  });
}

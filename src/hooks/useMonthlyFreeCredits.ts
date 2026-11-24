import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const MONTHLY_FREE_CREDITS_DEFAULT = 20;

/** Super Admin-configured monthly free credits; the server grant reads the same value. */
export function useMonthlyFreeCredits() {
  return useQuery({
    queryKey: ['monthly-free-credits'],
    queryFn: async (): Promise<number> => {
      const { data: rows, error } = await (supabase as any).rpc('get_public_platform_settings');
      if (error) throw error;
      const data = rows?.[0];
      return Number(data?.monthly_free_credits ?? MONTHLY_FREE_CREDITS_DEFAULT);
    },
    staleTime: 60_000,
  });
}

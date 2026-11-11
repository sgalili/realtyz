import { Fragment, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCreditsPerIls, setCreditsPerIls, subscribeCreditRate } from '@/lib/credits';

export const CREDIT_RATE_QUERY_KEY = ['credit-conversion-rate'];

/** Current credits-per-ILS rate; re-renders when the configured rate changes. */
export function useCreditRate() {
  return useSyncExternalStore(subscribeCreditRate, getCreditsPerIls, getCreditsPerIls);
}

/** Loads the Super Admin-configured rate and remounts the tree if it differs, so every price recomputes. */
export function CreditRateSync({ children }: { children: ReactNode }) {
  const rate = useCreditRate();
  const { data } = useQuery({
    queryKey: CREDIT_RATE_QUERY_KEY, staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_credits_per_ils');
      if (error) throw error;
      return Number(data);
    },
  });
  useEffect(() => { if (data) setCreditsPerIls(data); }, [data]);
  return <Fragment key={rate}>{children}</Fragment>;
}

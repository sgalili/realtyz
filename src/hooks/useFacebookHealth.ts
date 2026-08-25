import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type FacebookHealth = {
  /** A Page binding exists AND its token still answers Graph. */
  pageConnected: boolean;
  /** A Page binding exists but the token expired / was revoked. */
  needsReconnect: boolean;
  /** Hebrew reason to show in the banner. */
  reason: string | null;
  pageName: string | null;
  /** True when nothing was ever connected (no banner — just an empty state). */
  neverConnected: boolean;
};

/**
 * Live Facebook connection health for the active workspace.
 *
 * Distinguishes "never connected" (silent) from "token expired / revoked"
 * (loud banner), so brokers learn about a broken publishing pipeline before a
 * campaign silently fails.
 */
export function useFacebookHealth() {
  const { user } = useAuth();

  return useQuery<FacebookHealth>({
    queryKey: ['facebook-health', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const [pageRes, personalRes] = await Promise.all([
        supabase.functions
          .invoke('meta-page-connect', { body: { action: 'health' } })
          .catch(() => ({ data: null, error: true as const })),
        supabase.functions
          .invoke('fb-personal-connect', { body: { action: 'health' } })
          .catch(() => ({ data: null, error: true as const })),
      ]);

      const page = (pageRes as any)?.data ?? null;
      const personal = (personalRes as any)?.data ?? null;

      const hasBinding = !!page?.page?.id;
      const pageOk = !!page?.connected;
      const personalBroken = personal?.connected === true && personal?.token_valid === false;

      const needsReconnect = (hasBinding && !pageOk) || personalBroken;

      return {
        pageConnected: pageOk,
        needsReconnect,
        reason: needsReconnect
          ? String(page?.error || personal?.token_error || 'תוקף החיבור לפייסבוק פג. יש להתחבר מחדש.')
          : null,
        pageName: page?.page?.name ?? null,
        neverConnected: !hasBinding && !personal?.connected,
      };
    },
  });
}

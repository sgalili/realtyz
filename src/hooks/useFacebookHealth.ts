import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type FacebookHealth = {
  /** A Page binding exists AND its token still answers Graph. */
  pageConnected: boolean;
  /** A Page binding exists but the token expired / was revoked. */
  needsReconnect: boolean;
  /** Hebrew reason to show in the banner. */
  reason: string | null;
  /** Real page name straight from Meta (never a generic fallback). */
  pageName: string | null;
  pageId: string | null;
  pagePicture: string | null;
  instagram: { id: string; username: string | null } | null;
  /** True when nothing was ever connected (no banner — just an empty state). */
  neverConnected: boolean;
};

export const FACEBOOK_HEALTH_KEY = 'facebook-health';

/**
 * Single source of truth for Facebook connection state across the app:
 * the collapsed section badge, the expanded card badge and the global warning
 * banner all read this one React Query cache entry, so they can never disagree.
 */
export function useFacebookHealth() {
  const { user } = useAuth();

  return useQuery<FacebookHealth>({
    queryKey: [FACEBOOK_HEALTH_KEY, user?.id],
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

      // Only warn about a BROKEN connection: a verified page token must never
      // raise the banner, and "never connected" is an empty state, not a fault.
      const needsReconnect = (hasBinding && !pageOk) || (!pageOk && personalBroken);

      return {
        pageConnected: pageOk,
        needsReconnect,
        reason: needsReconnect
          ? String(page?.error || personal?.token_error || 'תוקף החיבור לפייסבוק פג. יש להתחבר מחדש.')
          : null,
        pageName: page?.page?.name ?? null,
        pageId: page?.page?.id ? String(page.page.id) : null,
        pagePicture: page?.page?.picture ?? null,
        instagram: page?.instagram?.id
          ? { id: String(page.instagram.id), username: page.instagram.username ?? null }
          : null,
        neverConnected: !hasBinding && !personal?.connected,
      };
    },
  });
}

/** Invalidate the shared Facebook state after connect / manual token / disconnect. */
export function useRefreshFacebookHealth() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: [FACEBOOK_HEALTH_KEY] });
  }, [qc]);
}

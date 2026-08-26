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

const CACHE_KEY = 'realtyz:fb-health';

/** Last verified-good connection, so a refresh never flashes "not connected". */
function readCache(userId?: string): FacebookHealth | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}:${userId ?? 'anon'}`);
    return raw ? (JSON.parse(raw) as FacebookHealth) : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string | undefined, value: FacebookHealth | null) {
  try {
    const key = `${CACHE_KEY}:${userId ?? 'anon'}`;
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

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
    placeholderData: () => readCache(user?.id) ?? undefined,
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
      const cached = readCache(user?.id);

      // A transport failure must never revoke a previously verified connection.
      if (!page && !personal && cached) return cached;

      const hasBinding = !!page?.page?.id;
      const pageOk = !!page?.connected;
      const personalBroken = personal?.connected === true && personal?.token_valid === false;

      // Only warn about a BROKEN connection: a verified page token must never
      // raise the banner, and "never connected" is an empty state, not a fault.
      const needsReconnect =
        (hasBinding && !pageOk && page?.needs_reconnect === true) ||
        (!pageOk && personalBroken);

      const value: FacebookHealth = {
        pageConnected: pageOk,
        needsReconnect,
        reason: needsReconnect
          ? String(page?.error || personal?.token_error || 'תוקף החיבור לפייסבוק פג. יש להתחבר מחדש.')
          : null,
        pageName: page?.page?.name ?? (pageOk ? null : cached?.pageName ?? null),
        pageId: page?.page?.id ? String(page.page.id) : cached?.pageId ?? null,
        pagePicture: page?.page?.picture ?? cached?.pagePicture ?? null,
        instagram: page?.instagram?.id
          ? { id: String(page.instagram.id), username: page.instagram.username ?? null }
          : null,
        neverConnected: !hasBinding && !personal?.connected,
      };

      // Persist only a healthy state; a broken one should not survive a fix.
      writeCache(user?.id, value.pageConnected ? value : null);
      return value;
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

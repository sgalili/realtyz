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
const FACEBOOK_STORAGE_KEYS = [
  'realtyz.campaigns.fb_page_bound.v1',
  'rz-connected-channels',
  'rz-connected-channel-names',
];

function writeCache(userId: string | undefined, value: FacebookHealth | null) {
  try {
    const key = `${CACHE_KEY}:${userId ?? 'anon'}`;
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

const DISCONNECTED_HEALTH: FacebookHealth = {
  pageConnected: false,
  needsReconnect: false,
  reason: null,
  pageName: null,
  pageId: null,
  pagePicture: null,
  instagram: null,
  neverConnected: true,
};

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
    staleTime: 0,
    refetchInterval: 5 * 60_000,
    refetchOnMount: 'always',
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
      if (!page) {
        writeCache(user?.id, null);
        return DISCONNECTED_HEALTH;
      }

      const hasBinding = !!page?.page?.id;
      // A stored page binding with a working page token IS a live connection.
      // The backend now scans every binding and only sets needs_reconnect when
      // zero bindings have a valid token AND at least one token failed auth.
      // We bind the banner EXACTLY to that boolean so it disappears the
      // instant the backend reports a working page token.
      const pageOk = !!page?.connected && hasBinding;
      const needsReconnect = page?.needs_reconnect === true;

      const value: FacebookHealth = {
        pageConnected: pageOk,
        needsReconnect,
        reason: needsReconnect
          ? String(page?.error || 'תוקף החיבור לפייסבוק פג. יש להתחבר מחדש.')
          : null,
        pageName: pageOk ? page?.page?.name ?? null : null,
        pageId: pageOk && page?.page?.id ? String(page.page.id) : null,
        pagePicture: pageOk ? page?.page?.picture ?? null : null,
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

/** Atomically clear cached Facebook state so every badge/banner updates now. */
export function useResetFacebookHealth() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useCallback(async () => {
    await qc.cancelQueries({ queryKey: [FACEBOOK_HEALTH_KEY] });
    writeCache(user?.id, null);
    try {
      FACEBOOK_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
      FACEBOOK_STORAGE_KEYS.forEach((key) => sessionStorage.removeItem(key));
      Object.keys(localStorage)
        .filter((key) => key.startsWith(`${CACHE_KEY}:`))
        .forEach((key) => localStorage.removeItem(key));
      window.dispatchEvent(new CustomEvent('realtyz:facebook-disconnected'));
    } catch {
      /* storage can be unavailable in hardened browsers */
    }
    qc.removeQueries({ queryKey: ['meta-page-binding'] });
    qc.removeQueries({ queryKey: ['social-connections'] });
    qc.removeQueries({ queryKey: ['fb-personal-connection'] });
    qc.removeQueries({ queryKey: ['fb-user-groups'] });
    qc.removeQueries({ queryKey: ['custom-user-groups'] });
    qc.setQueryData([FACEBOOK_HEALTH_KEY, user?.id], DISCONNECTED_HEALTH);
  }, [qc, user?.id]);
}

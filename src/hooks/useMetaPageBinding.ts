import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

export type MetaPageBinding = {
  pageId: string;
  pageName: string | null;
  pageAvatarUrl: string | null;
  hasToken: boolean;
  connectedAt: string | null;
  isShared: boolean;
};

export const META_PAGE_BINDING_KEY = 'meta-page-binding';

/**
 * Reads the effective Facebook Page binding straight from the database: the
 * workspace's own page when it has one, otherwise the platform-shared page, so
 * every user always has a live Facebook connection.
 */
export function useMetaPageBinding() {
  const { user } = useAuth();
  const workspaceOwnerId = useActiveWorkspaceOwnerId();

  return useQuery<MetaPageBinding | null>({
    queryKey: [META_PAGE_BINDING_KEY, workspaceOwnerId],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_effective_meta_page', { _owner: workspaceOwnerId });
      const row: any = Array.isArray(data) ? data[0] : data;
      if (error || !row?.page_id) return null;
      return {
        pageId: String(row.page_id),
        pageName: row.page_name ?? null,
        pageAvatarUrl: row.page_avatar_url ?? null,
        hasToken: !!row.has_token,
        connectedAt: null,
        isShared: !!row.is_shared,
      };
    },
  });
}


/** Re-read the stored binding right after OAuth / manual token / disconnect. */
export function useRefreshMetaPageBinding() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: [META_PAGE_BINDING_KEY] });
  }, [qc]);
}

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
};

export const META_PAGE_BINDING_KEY = 'meta-page-binding';

/**
 * Reads the stored Facebook Page binding straight from the database, so the
 * connected page (name + avatar + status) renders instantly without waiting
 * for the Graph health probe in the edge functions.
 */
export function useMetaPageBinding() {
  const { user } = useAuth();
  const workspaceOwnerId = useActiveWorkspaceOwnerId();

  return useQuery<MetaPageBinding | null>({
    queryKey: [META_PAGE_BINDING_KEY, workspaceOwnerId],
    enabled: !!user?.id && !!workspaceOwnerId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messenger_page_bindings')
        .select('page_id, page_name, page_avatar_url, page_access_token, updated_at')
        .eq('owner_id', workspaceOwnerId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data?.page_id) return null;
      return {
        pageId: String(data.page_id),
        pageName: (data as any).page_name ?? null,
        pageAvatarUrl: (data as any).page_avatar_url ?? null,
        hasToken: String((data as any).page_access_token ?? '').trim().length > 30,
        connectedAt: (data as any).updated_at ?? null,
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

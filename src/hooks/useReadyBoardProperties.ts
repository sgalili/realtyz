import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { isReadyForBoard, type BoardPublicationCandidate } from '@/lib/readyForBoard';

export type ReadyBoardProperty = BoardPublicationCandidate & { id: string; property_title: string | null };

export function useReadyBoardProperties(enabled = true) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  return useQuery({
    queryKey: ['ready-board-properties', user?.id, activeWorkspaceId],
    enabled: enabled && Boolean(user?.id && activeWorkspaceId),
    queryFn: async () => {
      if (!user?.id || !activeWorkspaceId) return [];
      const rows: ReadyBoardProperty[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.from('listings')
          .select('id,property_title,address,city,asking_price,status,is_published,affiliate_enabled')
          .eq('workspace_owner_id', activeWorkspaceId)
          .order('created_at', { ascending: false }).order('id')
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        rows.push(...(data ?? []));
        if ((data?.length ?? 0) < pageSize) break;
      }
      return rows.filter(isReadyForBoard);
    },
  });
}
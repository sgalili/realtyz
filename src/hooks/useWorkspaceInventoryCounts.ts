import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type WorkspaceInventoryCount = {
  workspace_owner_id: string;
  inventory_kind: 'projects' | 'properties';
  inventory_count: number;
};

export function useWorkspaceInventoryCounts(open: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['workspace-inventory-counts', user?.id],
    enabled: open && !!user?.id,
    staleTime: 0,
    queryFn: async (): Promise<WorkspaceInventoryCount[]> => {
      const { data, error } = await supabase.rpc('get_workspace_inventory_counts');
      if (error) throw error;
      return (data ?? []).flatMap(row => {
        if (row.inventory_kind !== 'projects' && row.inventory_kind !== 'properties') return [];
        return [{ ...row, inventory_kind: row.inventory_kind, inventory_count: Number(row.inventory_count) }];
      });
    },
  });
}
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import type { DeveloperProject } from '@/lib/developerProjectForm';

export function useWorkspaceDeveloperProjects() {
  const { activeWorkspaceId } = useWorkspace();
  return useQuery({
    queryKey: ['developer-projects', activeWorkspaceId],
    enabled: !!activeWorkspaceId,
    refetchOnMount: 'always',
    queryFn: async () => {
      if (!activeWorkspaceId) return [];
      const projects: DeveloperProject[] = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await supabase.from('developer_projects').select('*')
          .eq('workspace_owner_id', activeWorkspaceId)
          .order('created_at', { ascending: false }).order('id').range(from, from + 499);
        if (error) throw error;
        projects.push(...(data ?? []));
        if (!data || data.length < 500) return projects;
      }
    },
  });
}
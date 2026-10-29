import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
export default function PersonalTasks() {
  const { user } = useAuth();
  const owner = useActiveWorkspaceOwnerId();
  const query = useQuery({ queryKey: ['personal-tasks', user?.id, owner], enabled: !!user && !!owner,
    queryFn: async () => {
      if (!user || !owner) return [];
      const { data, error } = await supabase.from('scheduled_items').select('id,title,content,scheduled_for,status').eq('workspace_owner_id', owner).eq('user_id', user.id).in('item_type', ['task', 'reminder', 'follow_up']).order('scheduled_for').limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (query.isLoading) return <p role="status">טוען מטלות…</p>;
  if (query.isError) return <Button variant="outline" onClick={() => void query.refetch()}>ניסיון נוסף</Button>;
  return <div dir="rtl" className="divide-y">{query.data?.length ? query.data.map(task => <div key={task.id} className="space-y-1 py-3"><p className="text-lg font-medium">{task.title}</p><p className="text-sm text-muted-foreground">{task.content}</p><time className="text-sm text-muted-foreground">{new Date(task.scheduled_for).toLocaleString('he-IL')}</time></div>) : <p className="py-8 text-center text-muted-foreground">אין מטלות כרגע</p>}</div>;
}
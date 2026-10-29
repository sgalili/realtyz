import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { boundedRequest } from '@/lib/boundedRequest';
import { Button } from '@/components/ui/button';
export default function PrivateActivityInquiries() {
  const { user } = useAuth();
  const owner = useActiveWorkspaceOwnerId();
  const query = useQuery({ queryKey: ['private-activity-inquiries', user?.id, owner], enabled: !!user && !!owner, retry: false,
    queryFn: async () => {
      if (!owner) return [];
      const { data, error } = await boundedRequest(supabase.from('leads').select('id, full_name, created_at').eq('workspace_owner_id', owner).order('created_at', { ascending: false }).limit(100));
      if (error) throw error;
      return data ?? [];
    },
  });
  if (query.isLoading) return <p role="status" className="py-8 text-center">טוען פניות…</p>;
  if (query.isError) return <p role="alert" className="py-8 text-center">לא ניתן לטעון את הפניות <Button variant="link" onClick={() => void query.refetch()}>ניסיון נוסף</Button></p>;
  return <div className="divide-y">{query.data?.length ? query.data.map(row => <div key={row.id} className="flex items-center justify-between gap-2 py-3 text-sm"><span>{row.full_name || 'פנייה'}</span><time className="text-muted-foreground">{new Date(row.created_at).toLocaleDateString('he-IL')}</time></div>) : <p className="py-8 text-center text-muted-foreground">עדיין אין פניות</p>}</div>;
}
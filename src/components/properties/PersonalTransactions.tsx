import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
export default function PersonalTransactions() {
  const { user } = useAuth(); const owner = useActiveWorkspaceOwnerId();
  const query = useQuery({ queryKey: ['personal-transactions', user?.id, owner], enabled: !!user && !!owner,
    queryFn: async () => {
      if (!user || !owner) return [];
      let request = supabase.from('leads').select('id,full_name,lead_stage,status').eq('workspace_owner_id', owner);
      if (owner !== user.id) request = request.eq('assigned_to', user.id);
      const { data, error } = await request.in('lead_stage', ['tour_scheduled', 'negotiation', 'contract', 'closed']).order('created_at', { ascending: false }).limit(100);
      if (error) throw error; return data ?? [];
    },
  });
  if (query.isLoading) return <p role="status">טוען עסקאות…</p>;
  if (query.isError) return <Button variant="outline" onClick={() => void query.refetch()}>ניסיון נוסף</Button>;
  return <div dir="rtl" className="divide-y">{query.data?.length ? query.data.map(deal => <div key={deal.id} className="py-3 text-base">{deal.full_name || 'פנייה'}</div>) : <p className="py-8 text-center text-muted-foreground">אין עסקאות כרגע</p>}</div>;
}
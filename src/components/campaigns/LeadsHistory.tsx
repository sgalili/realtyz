import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';

const PAGE = 30;
const fmt = (d: string) => new Date(d).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
const DEAL: Record<string, string> = { sale: 'מכירה', rent: 'השכרה' };

export default function LeadsHistory() {
  const { user } = useAuth();
  const { activeWorkspaceId: ws } = useWorkspace();
  const [page, setPage] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ['leads-history', user?.id, ws, page],
    enabled: !!user && !!ws,
    queryFn: async () => {
      const { data, error, count } = await supabase.from('leads')
        .select('id, full_name, city, status, deal_type, lead_category, created_at', { count: 'exact' })
        .eq('workspace_owner_id', ws!).eq('is_demo', false)
        .order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });
  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data?.rows.length) return <p className="py-10 text-center text-muted-foreground">עדיין לא התקבלו לידים.</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">סה״כ {data.total} לידים</p>
      <div className="overflow-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted text-muted-foreground">
            <tr>{['זמן', 'שם', 'עיר', 'סוג עסקה', 'סטטוס'].map((h) => <th key={h} className="px-3 py-2 text-right font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.rows.map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="whitespace-nowrap px-3 py-2">{fmt(r.created_at)}</td>
                <td className="px-3 py-2">{r.full_name || '—'}</td>
                <td className="px-3 py-2">{r.city || '—'}</td>
                <td className="px-3 py-2">{DEAL[r.deal_type] ?? r.lead_category ?? '—'}</td>
                <td className="px-3 py-2">{r.status || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.total > PAGE && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>הקודם</Button>
          <span className="text-sm text-muted-foreground">{page + 1} / {Math.ceil(data.total / PAGE)}</span>
          <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage((p) => p + 1)}>הבא</Button>
        </div>
      )}
    </div>
  );
}

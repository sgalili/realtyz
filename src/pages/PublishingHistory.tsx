import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Button } from '@/components/ui/button';
import DailyPostingLimitNotice, { useFbPostingCapacity } from '@/components/campaigns/DailyPostingLimitNotice';

type Row = {
  id: string; created_at: string; scheduled_for: string | null; completed_at: string | null; activity_type: string;
  target_label: string | null; target_ref: string | null; status: string; publication_status: string | null;
  last_error: string | null; page_name: string | null; likes_count: number | null; comments_count: number | null; total_count: number;
};

const PAGE = 30;
const STATUS: Record<string, string> = {
  completed: 'פורסם', processing: 'בפרסום', pending: 'מתוזמן', failed: 'נכשל', cancelled: 'בוטל', rejected: 'נדחה',
};
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function PublishingHistory() {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const { activeWorkspaceId: ws } = useWorkspace();
  const { data: cap } = useFbPostingCapacity();
  const { data, isLoading } = useQuery({
    queryKey: ['publishing-history', user?.id, ws, page],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_publishing_history' as any, { _limit: PAGE, _offset: page * PAGE });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const total = data?.[0]?.total_count ?? 0;

  return (
    <div dir="rtl" className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <h1 className="text-xl font-bold text-foreground">היסטוריית פעילות ולידים</h1>
      <DailyPostingLimitNotice always />
      {!!cap?.pages.length && (
        <div className="flex flex-wrap gap-2">
          {cap.pages.map((p) => (
            <span key={p.page_id} className="rounded-full border border-border px-3 py-1 text-sm text-foreground">
              {p.page_name || p.page_id} · {p.used}/{cap.per_page_limit}
            </span>
          ))}
        </div>
      )}
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !data?.length ? (
        <p className="py-10 text-center text-muted-foreground">עדיין אין פעילות פרסום.</p>
      ) : (
        <div className="overflow-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>{['זמן', 'קבוצה / יעד', 'דף עסקי', 'סטטוס', 'תגובות', 'הערה'].map((h) => <th key={h} className="px-3 py-2 text-right font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-2">{fmt(r.completed_at || r.scheduled_for || r.created_at)}</td>
                  <td className="px-3 py-2">{r.target_label || r.target_ref || '—'}</td>
                  <td className="px-3 py-2">{r.page_name || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{STATUS[r.status] ?? r.status}</td>
                  <td className="px-3 py-2">{r.comments_count ?? 0}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-muted-foreground" title={r.last_error ?? ''}>{r.last_error || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > PAGE && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>הקודם</Button>
          <span className="text-sm text-muted-foreground">{page + 1} / {Math.ceil(total / PAGE)}</span>
          <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>הבא</Button>
        </div>
      )}
    </div>
  );
}

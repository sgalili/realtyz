import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import type { TransparencyFilter } from './TransparencyWidget';

const statusLabel = (s: string | null) => s === 'open' ? 'במחלוקת' : s === 'upheld' ? 'נדחתה' : 'מאושרת';
const titles: Record<string, string> = { leads_30d: 'פניות ב־30 הימים האחרונים', approved: 'פניות מאושרות', disputed: 'פניות במחלוקת', rejected: 'פניות שנדחו' };

/** Filtered inquiry records for the selected transparency box (server-authorized). */
export default function TransparencyResults({ filter }: { filter: TransparencyFilter }) {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { data = [], isLoading } = useQuery({
    queryKey: ['transparency-charges', user?.id, activeWorkspaceId, filter.side, filter.key],
    enabled: !!user?.id,
    queryFn: async () => { const { data, error } = await supabase.rpc('get_transparency_charges', { _side: filter.side, _filter: filter.key }); if (error) throw error; return data ?? []; },
  });
  return <section className="space-y-2 rounded-lg border bg-card p-3">
    <h2 className="font-bold">{data.length} {titles[filter.key]}</h2>
    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : !data.length ? <p className="text-sm text-muted-foreground">אין רשומות להצגה</p> :
      <ul className="divide-y">{data.map(r => <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
        <span className="min-w-0 truncate font-medium">{r.title || 'נכס'}</span>
        <span className="flex shrink-0 items-center gap-3 text-muted-foreground"><span>{statusLabel(r.dispute_status)}</span><b className="text-foreground">₪{Number(r.gross || 0).toLocaleString('he-IL')}</b><time>{new Date(r.created_at).toLocaleDateString('he-IL')}</time></span>
      </li>)}</ul>}
  </section>;
}

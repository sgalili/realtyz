import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { toast } from 'sonner';
import { pokeExtension } from '@/lib/extensionPairing';

// One shared live channel per workspace (ref-counted) so many cards don't open many sockets.
const live = new Map<string, { n: number; ch: ReturnType<typeof supabase.channel>; t?: ReturnType<typeof setTimeout> }>();
function useQueueLive(owner: string | null | undefined, onChange: () => void) {
  useEffect(() => {
    if (!owner) return;
    let e = live.get(owner);
    if (!e) {
      const ch = supabase.channel(`group-queue-${owner}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_activity_queue', filter: `workspace_owner_id=eq.${owner}` }, () => {
          const cur = live.get(owner);
          if (!cur) return;
          clearTimeout(cur.t);
          cur.t = setTimeout(() => window.dispatchEvent(new CustomEvent('group-queue-change')), 250);
        })
        .subscribe();
      e = { n: 0, ch };
      live.set(owner, e);
    }
    e.n++;
    window.addEventListener('group-queue-change', onChange);
    return () => {
      window.removeEventListener('group-queue-change', onChange);
      const cur = live.get(owner);
      if (cur && --cur.n <= 0) { clearTimeout(cur.t); supabase.removeChannel(cur.ch); live.delete(owner); }
    };
  }, [owner, onChange]);
}

type Progress = { total: number; completed: number; pending: number; processing: number; stalled: number; failed: number };

/** Shows "X/Y" group progress and a resume button for interrupted group posts.
 *  Resuming re-queues only unfinished groups; already-posted groups are never repeated. */
export function ResumePostingButton({ campaignLogId }: { campaignLogId: string }) {
  const owner = useActiveWorkspaceOwnerId();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const key = ['group-posting-progress', owner, campaignLogId];
  const { data } = useQuery({
    queryKey: key,
    enabled: !!owner && !!campaignLogId,
    queryFn: async (): Promise<Progress | null> => {
      const { data, error } = await (supabase.rpc as any)('get_group_posting_progress', { _campaign_log_ids: [campaignLogId] });
      if (error) throw error;
      return (data?.[0] as Progress) ?? null;
    },
    refetchInterval: (q) => {
      const p = q.state.data as Progress | null | undefined;
      return p && (p.pending + p.processing) > 0 ? 4_000 : 60_000;
    },
  });
  const [refetchLive] = useState(() => () => { void qc.invalidateQueries({ queryKey: ['group-posting-progress'] }); });
  useQueueLive(owner, refetchLive);

  if (!data || data.total < 1) return null;
  if (data.completed >= data.total) return null;

  const resume = async () => {
    if (busy || !owner) return;
    setBusy(true);
    try {
      const { data: n, error } = await (supabase.rpc as any)('resume_group_posting', { _campaign_log_id: campaignLogId });
      if (error) throw error;
      // Wake the extension immediately instead of waiting for its 1-minute alarm.
      try { pokeExtension(); } catch { /* extension may be absent */ }
      toast.success(n > 0 ? `הפרסום ימשיך ב-${n} קבוצות שנותרו` : 'אין קבוצות לחידוש');
      await qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['extension-queue'] });
    } catch (e: any) {
      toast.error(e?.message || 'החידוש נכשל');
    } finally { setBusy(false); }
  };

  const running = data.pending + data.processing > 0;
  return (
    <span className="inline-flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {running && (
        <span role="status" aria-live="polite"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 text-[11px] font-medium text-primary tabular-nums"
          title={data.processing > 0 ? `מפרסם לקבוצה ${Math.min(data.completed + 1, data.total)} מתוך ${data.total}` : `ממתין לפרסום · ${data.completed}/${data.total}`}>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          {data.completed}/{data.total}
        </span>
      )}
      <Button type="button" variant="outline" size="icon"
        className="h-7 w-7 shrink-0 rounded-md border-primary/40 bg-background text-primary"
        title={`המשך פרסום ל-${data.total - data.completed} קבוצות שנותרו · פורסמו ${data.completed}/${data.total}`}
        aria-label="המשך פרסום מהקבוצה שנעצרה"
        disabled={busy} onClick={() => void resume()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
      </Button>
    </span>
  );
}

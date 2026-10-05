import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { toast } from 'sonner';
import { pokeExtension } from '@/lib/extensionPairing';

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
      return p && (p.pending + p.processing) > 0 ? 10_000 : 60_000;
    },
  });

  if (!data || data.total < 1) return null;
  const resumable = data.stalled + data.failed;
  const active = data.pending + data.processing;
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

  const label = `${data.completed}/${data.total} קבוצות`;
  return (
    <span className="inline-flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <span className="whitespace-nowrap text-[10px] font-semibold tabular-nums text-muted-foreground sm:text-[11px]"
        title={`פורסמו ${data.completed} · ממתינות ${active} · נעצרו ${resumable}`}>
        {label}
      </span>
      {(
        <Button type="button" variant="outline" size="icon"
          className="h-7 w-7 shrink-0 rounded-md border-primary/40 bg-background text-primary"
          title={`המשך פרסום ל-${data.total - data.completed} קבוצות שנותרו`} aria-label="המשך פרסום מהקבוצה שנעצרה"
          disabled={busy} onClick={() => void resume()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        </Button>
      )}
    </span>
  );
}

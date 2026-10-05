import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { toast } from 'sonner';
import { pokeExtension } from '@/lib/extensionPairing';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useGroupQueueLive } from '@/hooks/useGroupQueueLive';

type Progress = { total: number; completed: number; pending: number; processing: number; stalled: number; failed: number };

/** Shows "X/Y" group progress and a resume button for interrupted group posts.
 *  Resuming re-queues only unfinished groups; already-posted groups are never repeated. */
export function ResumePostingButton({ campaignLogId, fallbackProgress }: { campaignLogId: string; fallbackProgress?: Progress }) {
  const owner = useActiveWorkspaceOwnerId();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const key = ['group-posting-progress', owner, campaignLogId];
  const persisted = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(campaignLogId);
  const { data: stored, isError } = useQuery({
    queryKey: key,
    enabled: !!owner && persisted,
    queryFn: async (): Promise<Progress | null> => {
      const { data, error } = await (supabase.rpc as any)('get_group_posting_progress', { _campaign_log_ids: [campaignLogId] });
      if (error) throw error;
      return (data?.[0] as Progress) ?? null;
    },
    refetchInterval: (q) => {
      const p = q.state.data as Progress | null | undefined;
      return !p || p.total < 1 || (p.pending + p.processing) > 0 ? 4_000 : 60_000;
    },
  });
  useGroupQueueLive(owner, () => { void qc.invalidateQueries({ queryKey: key }); });
  const data = stored && stored.total > 0 ? stored : fallbackProgress;

  if (!data || data.total < 1) return isError ? <span role="status" title="לא ניתן לעדכן את התקדמות הפרסום" className="shrink-0 text-xs text-destructive">!</span> : null;
  if (data.completed >= data.total) return null;

  const resume = async () => {
    if (busy || !owner) return;
    setBusy(true);
    // Instant feedback so the click never feels dead.
    toast.loading('מחדש את תור הפרסום...', { id: `resume-${campaignLogId}` });
    // Wake the extension right away — it will pick up the re-queued jobs.
    try { pokeExtension(); } catch { /* extension may be absent */ }
    try {
      if (!persisted) {
        toast.success('בקשת המשך נשלחה לתוסף', { id: `resume-${campaignLogId}` });
        return;
      }
      const { data: n, error } = await (supabase.rpc as any)('resume_group_posting', { _campaign_log_id: campaignLogId });
      if (error) throw error;
      // Poke again after the server re-queued, so the extension polls fresh state.
      try { pokeExtension(); } catch { /* extension may be absent */ }
      toast.success(n > 0 ? `הפרסום ימשיך ב-${n} קבוצות שנותרו` : 'אין קבוצות לחידוש', { id: `resume-${campaignLogId}` });
      await qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['extension-queue'] });
    } catch (e: any) {
      console.error('[resume_group_posting]', e);
      toast.error(e?.message || 'החידוש נכשל', { id: `resume-${campaignLogId}` });
    } finally { setBusy(false); }
  };

  const running = data.pending + data.processing > 0;
  const remaining = data.total - data.completed;
  const title = busy
    ? 'מחדש פרסום...'
    : running
      ? `${data.processing > 0 ? `מפרסם לקבוצה ${Math.min(data.completed + 1, data.total)} מתוך ${data.total}` : `ממתין לפרסום · ${data.completed}/${data.total}`} · לחיצה תחדש את התור`
      : `פורסמו ${data.completed}/${data.total} · לחיצה תמשיך ל-${remaining} קבוצות שנותרו`;
  return (
    <Button type="button" variant="ghost" size="sm"
      onClick={(e) => { e.stopPropagation(); void resume(); }}
      disabled={busy}
      title={title}
      aria-label={`${title}`}
      className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0 text-[11px] font-medium text-primary tabular-nums transition-colors hover:bg-primary/20 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70">
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : running ? (
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
      ) : (
        <Play className="h-3 w-3" aria-hidden />
      )}
      <span aria-live="polite" dir="ltr">{data.completed}/{data.total}</span>
    </Button>
  );
}

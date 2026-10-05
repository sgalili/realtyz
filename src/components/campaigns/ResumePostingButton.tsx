import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Loader2, Check, XCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SendClockIcon } from '@/components/campaigns/SendClockIcon';
import { supabase } from '@/integrations/supabase/client';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { toast } from 'sonner';
import { pokeExtension } from '@/lib/extensionPairing';
import { Button } from '@/components/ui/button';
import { useGroupQueueLive } from '@/hooks/useGroupQueueLive';

type Progress = { total: number; completed: number; pending: number; processing: number; stalled: number; failed: number };

/** Shows "X/Y" group progress and a resume button for interrupted group posts.
 *  Resuming re-queues only unfinished groups; already-posted groups are never repeated. */
export function ResumePostingButton({ campaignLogId, fallbackProgress }: { campaignLogId: string; fallbackProgress?: Progress }) {
  const owner = useActiveWorkspaceOwnerId();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
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
  useGroupQueueLive(owner, () => { void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: ['group-posting-jobs', owner, campaignLogId] }); });
  const data = stored && stored.total > 0 ? stored : fallbackProgress;
  // Per-group job rows (RLS keeps them inside the active workspace).
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['group-posting-jobs', owner, campaignLogId],
    enabled: open && !!owner && persisted,
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from('campaign_activity_queue')
        .select('id, status, publication_status, last_error, scheduled_for, payload->group_url, payload->group_name')
        .eq('payload->>campaign_log_id', campaignLogId)
        .order('scheduled_for', { ascending: true });
      if (error) throw error;
      return (rows ?? []) as Array<{ id: string; status: string; publication_status: string | null; last_error: string | null; scheduled_for: string | null; group_url: string | null; group_name: string | null }>;
    },
    refetchInterval: open ? 4_000 : false,
  });

  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !owner || !data || data.total < 1 || data.completed >= data.total) return;
    autoRan.current = true;
    try { pokeExtension(); } catch { /* extension may be absent */ }
    const k = `auto-resume:${owner}:${campaignLogId}`;
    const idle = data.pending + data.processing === 0;
    if (persisted && idle && !sessionStorage.getItem(k)) {
      sessionStorage.setItem(k, '1');
      void (supabase.rpc as any)('resume_group_posting', { _campaign_log_id: campaignLogId })
        .then(() => { try { pokeExtension(); } catch { /* noop */ } qc.invalidateQueries({ queryKey: key }); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, campaignLogId, data?.total, data?.completed]);

  if (!data || data.total < 1) return isError ? <span role="status" title="לא ניתן לעדכן את התקדמות הפרסום" className="shrink-0 text-xs text-destructive">!</span> : null;
  if (data.completed >= data.total) return null;

  const resume = async () => {
    if (busy) return;
    if (!owner) {
      toast.error('לא ניתן לחדש — סביבת העבודה עדיין נטענת, נסו שוב בעוד רגע');
      return;
    }
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

  const markPublished = async () => {
    if (busy || !owner || !persisted) return;
    if (!window.confirm('לסמן את כל הקבוצות שנותרו כפורסמו? הפעולה לא תפרסם בפייסבוק.')) return;
    setBusy(true);
    try {
      const { data: n, error } = await (supabase.rpc as any)('mark_group_posts_published', { _campaign_log_id: campaignLogId });
      if (error) throw error;
      qc.setQueryData(key, { ...data, completed: data.total, pending: 0, processing: 0, failed: 0, stalled: 0 });
      toast.success(`${n} קבוצות סומנו כפורסמו`);
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ['group-posting-jobs', owner, campaignLogId] });
      void qc.invalidateQueries({ queryKey: ['extension-queue'] });
    } catch (e: any) {
      toast.error(e?.message || 'הסימון נכשל');
    } finally { setBusy(false); }
  };

  const running = data.pending + data.processing > 0;
  const remaining = data.total - data.completed;
  const title = busy
    ? 'מחדש פרסום...'
    : running
      ? `${data.processing > 0 ? `מפרסם לקבוצה ${Math.min(data.completed + 1, data.total)} מתוך ${data.total}` : `ממתין לפרסום · ${data.completed}/${data.total}`} · לחיצה תחדש את התור`
      : `פורסמו ${data.completed}/${data.total} · לחיצה תמשיך ל-${remaining} קבוצות שנותרו`;
  const groupLabel = (j: { group_name: string | null; group_url: string | null }) => {
    if (j.group_name) return j.group_name;
    const m = String(j.group_url || '').match(/groups\/([^/?#]+)/);
    return m ? m[1] : 'קבוצה';
  };
  const timeOf = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm"
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={title}
            aria-expanded={open}
            title={title}
            className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0 text-[11px] font-medium text-primary tabular-nums transition-colors hover:bg-primary/20 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
      </PopoverTrigger>
      <PopoverContent align="start" dir="rtl" className="w-72 p-2" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <span className="text-sm font-semibold">פורסמו {data.completed} מתוך {data.total}</span>
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={busy || !persisted}
              title="סימון כל הקבוצות שנותרו כפורסמו"
              onClick={(e) => { e.stopPropagation(); void markPublished(); }}>
              <Check className="h-3 w-3" strokeWidth={3} />
              סמן כפורסם
            </Button>
            <Button type="button" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={busy}
              onClick={(e) => { e.stopPropagation(); void resume(); }}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              המשך פרסום
            </Button>
          </div>
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {jobsLoading && <li className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></li>}
          {!jobsLoading && (jobs ?? []).length === 0 && <li className="px-1 py-2 text-xs text-muted-foreground">אין נתוני קבוצות</li>}
          {(jobs ?? []).map((j) => {
            const done = j.status === 'completed' || j.status === 'sent' || j.publication_status === 'published';
            const failed = !done && (j.status === 'failed' || j.status === 'cancelled');
            const processing = j.status === 'processing';
            return (
              <li key={j.id} className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-muted/50">
                <span className="shrink-0">
                  {done ? <Check className="h-4 w-4 text-success" strokeWidth={3} />
                    : failed ? <XCircle className="h-4 w-4 text-destructive" />
                    : processing ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    : <SendClockIcon className="h-4 w-4 text-muted-foreground" />}
                </span>
                <span className="min-w-0 flex-1 truncate" title={groupLabel(j)}>{groupLabel(j)}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground" title={j.last_error || undefined}>
                  {done ? 'פורסם' : failed ? 'נכשל' : processing ? 'מפרסם…' : `ממתין ${timeOf(j.scheduled_for)}`}
                </span>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

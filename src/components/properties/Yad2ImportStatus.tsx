import { useEffect, useState } from 'react';
import { CheckCircle2, Timer, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { formatCountdown, resetYad2ImportJob, useYad2ImportJob } from '@/lib/yad2ImportJob';
import { useWorkspace } from '@/hooks/useWorkspace';

/** Live countdown + progress for the running Yad2 import. `banner` shows a dismissible strip for My Properties. */
export function Yad2ImportStatus({ banner = false }: { banner?: boolean }) {
  const job = useYad2ImportJob();
  const { activeWorkspaceId } = useWorkspace();
  const [now, setNow] = useState(Date.now());
  const busy = job.phase === 'discovering' || job.phase === 'importing';
  useEffect(() => { if (!busy) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [busy]);

  if (job.phase === 'idle' || (banner && job.workspaceId !== activeWorkspaceId)) return null;
  const remaining = job.etaAt ? job.etaAt - now : 0;
  const finished = job.done + job.failed;
  const pct = job.phase === 'discovering' ? 0 : job.total ? (finished / job.total) * 100 : 0;
  const pending = job.total - finished;

  return <div className={banner ? 'mx-3 my-2 space-y-2 rounded-xl border border-border bg-card p-3' : 'space-y-2'} aria-live="polite" data-testid="yad2-import-status">
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="font-medium">
        {job.phase === 'discovering' ? 'מאתר מודעות בעמוד המשרד…' : job.phase === 'importing' ? 'יבוא מיד 2 בתהליך' : 'היבוא מיד 2 הסתיים'}
      </span>
      {busy ? <span className="flex items-center gap-1 tabular-nums text-muted-foreground"><Timer className="h-4 w-4" />
        {remaining > 0 ? <>נותרו כ־<b className="text-foreground">{formatCountdown(remaining)}</b></> : 'עוד רגע…'}
      </span> : banner && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="סגירה" onClick={resetYad2ImportJob}><X className="h-4 w-4" /></Button>}
    </div>
    <Progress value={pct} />
    {job.phase !== 'discovering' && <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-primary" />נכנסו למערכת: <b>{job.done}</b></span>
      {busy && <span>בתהליך: <b>{pending}</b></span>}
      {job.failed > 0 && <span className="text-destructive">לא יובאו: <b>{job.failed}</b></span>}
      <span className="text-muted-foreground">מתוך {job.total}</span>
    </div>}
    {banner && busy && <p className="text-xs text-muted-foreground">אפשר להמשיך לעבוד, היבוא ממשיך ברקע והנכסים יופיעו כאן.</p>}
  </div>;
}

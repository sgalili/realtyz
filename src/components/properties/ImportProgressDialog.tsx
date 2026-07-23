import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { SourceBadge } from '@/components/properties/SourceBadge';
import type { UnifiedResult } from '@/lib/propertySearch';

export type ImportStepStatus = 'pending' | 'running' | 'success' | 'error';
export type ImportStep = {
  key: string;
  title: string;
  source: UnifiedResult['source'];
  status: ImportStepStatus;
  error?: string | null;
  localId?: string | null;
};

export function ImportProgressDialog({
  open,
  onOpenChange,
  steps,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  steps: ImportStep[];
  onDone?: () => void;
}) {
  const total = steps.length;
  const done = steps.filter((s) => s.status === 'success' || s.status === 'error').length;
  const success = steps.filter((s) => s.status === 'success').length;
  const failed = steps.filter((s) => s.status === 'error').length;
  const running = steps.some((s) => s.status === 'running');
  const pct = total ? Math.round((done / total) * 100) : 0;
  const allFinished = total > 0 && done === total;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>
            {allFinished ? 'הייבוא הסתיים' : running ? 'מייבא נכסים…' : 'ייבוא נכסים'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {done} / {total} הושלמו
            </span>
            <span className="tabular-nums font-semibold">{pct}%</span>
          </div>
          <Progress value={pct} />
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> {success} הצליחו
            </span>
            <span className="inline-flex items-center gap-1 text-destructive">
              <XCircle className="h-3.5 w-3.5" /> {failed} נכשלו
            </span>
          </div>

          <div className="max-h-[320px] overflow-y-auto rounded-md border divide-y">
            {steps.map((s) => (
              <div key={s.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="shrink-0">
                  {s.status === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {s.status === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
                  {s.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  {s.status === 'pending' && <Clock className="h-4 w-4 text-muted-foreground" />}
                </span>
                <SourceBadge source={s.source} compact />
                <span className="flex-1 truncate">{s.title || 'נכס'}</span>
                {s.status === 'error' && s.error && (
                  <span className="text-[11px] text-destructive truncate max-w-[140px]" title={s.error}>
                    {s.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant={allFinished ? 'default' : 'outline'}
            onClick={() => {
              onOpenChange(false);
              if (allFinished) onDone?.();
            }}
            disabled={running && !allFinished}
          >
            {allFinished ? 'סיום' : 'סגור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

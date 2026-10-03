import { cn } from '@/lib/utils';
import type { ExtensionProgress } from '@/lib/extensionGroupBridge';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { FIRST_COMMENT_WARNING, isCommentOnlyFailure } from '@/lib/campaignCardHandling';

/**
 * Live status badge + progress bar for a post the Realtyz browser extension
 * publishes into Facebook groups. Reflects the extension's real stage:
 * queued → navigating → writing → commenting → completed / failed.
 */
export const ExtensionPostProgress = ({
  progress,
  className,
}: {
  progress: ExtensionProgress;
  className?: string;
}) => {
  const commentWarning = isCommentOnlyFailure(progress.error);
  const done = progress.stage === 'completed' || commentWarning;
  const failed = progress.stage === 'failed' && !commentWarning;
  const running = !done && !failed;

  return (
    <div className={cn('flex w-14 shrink-0 flex-col gap-1', className)} dir="rtl">
      <span
        className={cn(
          'inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-[11px] font-bold ring-1',
          done && 'bg-emerald-100 text-emerald-800 ring-emerald-200',
          failed && 'bg-destructive/10 text-destructive ring-destructive/30',
          running && 'bg-blue-100 text-blue-800 ring-blue-200',
        )}
        title={commentWarning ? FIRST_COMMENT_WARNING : progress.error ?? progress.label}
      >
        {done ? <CheckCircle2 className="h-3.5 w-3.5" aria-label="פורסם" /> : failed ? <XCircle className="h-3.5 w-3.5" aria-label="נכשל" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label={progress.label} />}
        {commentWarning && <AlertTriangle className="h-3 w-3 text-muted-foreground" aria-label={FIRST_COMMENT_WARNING} />}
      </span>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            done && 'bg-emerald-500',
            failed && 'bg-destructive',
            running && 'bg-blue-500',
          )}
          style={{ width: `${Math.max(6, Math.min(100, progress.percent))}%` }}
        />
      </div>

    </div>
  );
};

export default ExtensionPostProgress;

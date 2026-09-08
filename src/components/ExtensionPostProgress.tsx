import { cn } from '@/lib/utils';
import type { ExtensionProgress } from '@/lib/extensionGroupBridge';

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
  const done = progress.stage === 'completed';
  const failed = progress.stage === 'failed';
  const running = !done && !failed;

  return (
    <div className={cn('flex min-w-[9rem] max-w-[16rem] flex-col gap-1', className)} dir="rtl">
      <span
        className={cn(
          'inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-[11px] font-bold ring-1',
          done && 'bg-emerald-100 text-emerald-800 ring-emerald-200',
          failed && 'bg-destructive/10 text-destructive ring-destructive/30',
          running && 'bg-blue-100 text-blue-800 ring-blue-200',
        )}
        title={progress.error ?? 'מנוהל בתור הפרסום של תוסף הדפדפן'}
      >
        <span className="truncate">{progress.label}</span>
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

      {failed && progress.error ? (
        <span className="truncate text-[10px] font-medium text-destructive" title={progress.error}>
          {progress.error}
        </span>
      ) : null}
    </div>
  );
};

export default ExtensionPostProgress;

// One standardized post card used by the פורסמו / עתידיים / טיוטות tabs so
// every list on the posts page looks identical: thumbnail (with image count),
// a single title line (the hook / address), collapsed group targets, and one
// metadata row with the channel logo, date, live status and actions.
//
// No preview body text, excerpts or sub-text is ever rendered here.
import { useState, type ReactNode } from 'react';
import { AlertTriangle, Calendar as CalendarIcon, CheckCircle2, ChevronDown, ChevronUp, Facebook, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GroupStatusChips, type GroupChipState, type GroupResult } from '@/components/campaigns/GroupStatusChips';
import type { FbGroupMeta } from '@/hooks/useFbGroupMeta';

export type QueueCardStatus = 'published' | 'scheduled' | 'draft' | 'failed' | 'publishing';

const STATUS_PILL: Record<QueueCardStatus, string> = {
  published: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  scheduled: 'bg-amber-100 text-amber-800 ring-amber-200',
  draft: 'bg-muted text-muted-foreground ring-border',
  failed: 'bg-destructive/10 text-destructive ring-destructive/30',
  publishing: 'bg-blue-100 text-blue-800 ring-blue-200',
};

const STATUS_LABEL: Record<QueueCardStatus, string> = {
  published: 'פורסם',
  scheduled: 'מתוזמן',
  draft: 'טיוטה',
  failed: 'נכשל',
  publishing: 'מפרסם',
};

/** dd/hh/mm remaining, matching the published-tab countdown format. */
function countdownLabel(iso?: string | null) {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return null;
  const s = Math.max(0, Math.floor((target - Date.now()) / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 86400))}/${pad(Math.floor((s % 86400) / 3600))}/${pad(Math.floor((s % 3600) / 60))}`;
}

export function QueueCard({
  title,
  imageUrl,
  imageCount = 0,
  groupIds = [],
  groupMeta,
  groupResults,
  groupChipState = 'pending',
  groupEmptyLabel,
  status,
  dateLabel,
  countdownIso,
  actions,
  details,
}: {
  title: string;
  imageUrl?: string | null;
  imageCount?: number;
  groupIds?: string[];
  groupMeta?: Record<string, FbGroupMeta>;
  groupResults?: Record<string, GroupResult>;
  groupChipState?: GroupChipState;
  groupEmptyLabel?: string;
  status: QueueCardStatus;
  dateLabel?: string | null;
  countdownIso?: string | null;
  actions?: ReactNode;
  /** Extra content revealed when the card is expanded. */
  details?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const countdown = status === 'scheduled' ? countdownLabel(countdownIso) : null;

  return (
    <article className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden" dir="rtl">
      <div className="p-4 space-y-2 cursor-pointer" onClick={() => setOpen((v) => !v)}>
        {/* Row 1: thumbnail + title only */}
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 shrink-0">
            {imageUrl ? (
              <img src={imageUrl} alt="" loading="lazy" className="h-12 w-12 rounded-lg border border-border object-cover" />
            ) : (
              <span className="block h-12 w-12 rounded-lg border border-border bg-muted" />
            )}
            {imageCount > 0 && (
              <span
                className="absolute -top-1 -right-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-black/70 px-1 py-0 text-[10px] font-bold leading-4 text-white"
                title={`${imageCount} תמונות`}
              >
                {imageCount}
              </span>
            )}
          </div>
          <h3 className="flex-1 text-right font-semibold text-foreground line-clamp-2">{title}</h3>
        </div>

        {/* Target groups + live status — revealed on expand only */}
        {open && (
          <div onClick={(e) => e.stopPropagation()}>
            <GroupStatusChips
              groupIds={groupIds}
              meta={groupMeta}
              results={groupResults}
              defaultState={groupChipState}
              countdownIso={status === 'scheduled' ? countdownIso : null}
              emptyLabel={groupEmptyLabel}
              defaultOpen
            />
            {details}
          </div>
        )}

        {/* Row 2: logo · date .... status · actions */}
        <div className="flex items-center gap-2">
          <Facebook className="h-5 w-5 shrink-0 text-[#1877F2]" />
          {dateLabel && (
            <span className={cn('whitespace-nowrap text-xs', status === 'scheduled' ? 'font-semibold text-amber-700' : 'text-muted-foreground')}>
              {dateLabel}
            </span>
          )}
          <span className="flex-1" />
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1', STATUS_PILL[status])}>
            {status === 'published' && <CheckCircle2 className="h-3 w-3" />}
            {status === 'failed' && <AlertTriangle className="h-3 w-3" />}
            {status === 'publishing' && <Loader2 className="h-3 w-3 animate-spin" />}
            {status === 'scheduled' && <CalendarIcon className="h-3 w-3" />}
            {countdown ? <span className="tabular-nums" dir="ltr">{countdown}</span> : STATUS_LABEL[status]}
          </span>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>{actions}</div>
          <button
            type="button"
            aria-label={open ? 'כווץ' : 'הרחב'}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </article>
  );
}

export default QueueCard;

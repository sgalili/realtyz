import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sourceRecord } from '../../../supabase/functions/_shared/projectHierarchy';

export type TimelineStep = { label: string; completed: boolean; current: boolean };

const text = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'object') { const r = sourceRecord(v); return text(r.label ?? r.title ?? r.name ?? r.text ?? r.milestone); }
  return String(v).trim();
};

/** Saved source milestones as ordered steps; unknown shapes are dropped, never invented. */
export function projectTimelineSteps(timeline: unknown): TimelineStep[] {
  if (!Array.isArray(timeline)) return [];
  return timeline.map(v => { const r = sourceRecord(v); return { label: typeof v === 'object' ? text(v) : text(v), completed: r.completed === true, current: r.current === true }; }).filter(s => s.label);
}

/** One-line horizontal project stage bar: dots with checks for completed milestones, scrolls sideways instead of wrapping. */
export default function ProjectTimelineBar({ timeline, compact = false, className }: { timeline: unknown; compact?: boolean; className?: string }) {
  const steps = projectTimelineSteps(timeline);
  if (!steps.length) return null;
  return <div dir="rtl" className={cn('overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}>
    <ol aria-label="שלבי הפרויקט" className="flex w-max min-w-full flex-nowrap items-start">
      {steps.map((s, i) => {
        const done = s.completed;
        const reached = done || s.current;
        return <li key={`${i}:${s.label}`} aria-current={s.current ? 'step' : undefined} className={cn('relative flex shrink-0 flex-col items-center text-center', compact ? 'min-w-[64px] px-1' : 'min-w-[84px] px-1.5')}>
          {i > 0 && <span aria-hidden className={cn('absolute h-0.5 w-full', compact ? 'top-[9px]' : 'top-[11px]', reached ? 'bg-success' : 'bg-border')} style={{ insetInlineStart: '-50%' }} />}
          <span className={cn('relative z-10 flex items-center justify-center rounded-full border-2', compact ? 'h-5 w-5' : 'h-6 w-6', done ? 'border-success bg-success text-success-foreground' : s.current ? 'border-success bg-background' : 'border-border bg-background')}>
            {done ? <Check className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} strokeWidth={3} aria-label="הושלם" /> : s.current ? <span className="h-2 w-2 rounded-full bg-success" /> : null}
          </span>
          <span className={cn('mt-1 whitespace-nowrap leading-tight', compact ? 'text-[11px]' : 'text-xs', reached ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{s.label}</span>
        </li>;
      })}
    </ol>
  </div>;
}

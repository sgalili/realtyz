import { cn } from '@/lib/utils';

export type PropertySource = 'mine' | 'homely' | 'webtiv' | 'yad2' | 'external';

// Distinct, vibrant per-source palettes. Keep both a light chip variant
// (badges/pills) and a solid dot color for legends/checkboxes.
const META: Record<PropertySource, { label: string; short: string; className: string; dot: string }> = {
  mine: {
    label: 'המאגר שלי',
    short: 'ש',
    className: 'bg-slate-100 text-slate-800 border-slate-300',
    dot: 'bg-slate-500',
  },
  homely: {
    label: 'הומלי',
    short: 'H',
    className: 'bg-violet-100 text-violet-800 border-violet-300',
    dot: 'bg-violet-600',
  },
  webtiv: {
    label: 'Webtiv',
    short: 'W',
    className: 'bg-teal-100 text-teal-800 border-teal-300',
    dot: 'bg-teal-600',
  },
  yad2: {
    label: 'יד-2',
    short: 'Y',
    className: 'bg-orange-100 text-orange-800 border-orange-300',
    dot: 'bg-orange-600',
  },
  external: {
    label: 'חיצוני',
    short: 'E',
    className: 'bg-zinc-100 text-zinc-700 border-zinc-300',
    dot: 'bg-zinc-500',
  },
};

export function SourceBadge({ source, className, compact }: { source: PropertySource; className?: string; compact?: boolean }) {
  const meta = META[source] ?? META.external;
  return (
    <span
      title={meta.label}
      className={cn(
        'inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap',
        meta.className,
        className,
      )}
    >
      {compact ? meta.short : meta.label}
    </span>
  );
}

export function sourceLabel(source: PropertySource): string {
  return (META[source] ?? META.external).label;
}

export function sourceDotClass(source: PropertySource): string {
  return (META[source] ?? META.external).dot;
}

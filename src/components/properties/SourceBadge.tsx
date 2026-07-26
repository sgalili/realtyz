import { cn } from '@/lib/utils';

export type PropertySource = 'mine' | 'homely' | 'webtiv' | 'yad2' | 'external';

// Solid, high-contrast per-source pills. `compact` renders a single white
// initial on the source's signature background color.
const META: Record<PropertySource, { label: string; short: string; className: string; solid: string; dot: string }> = {
  mine: {
    label: 'המאגר שלי',
    short: 'ש',
    className: 'bg-[#0b1f4b] text-white border-[#0b1f4b]',
    solid: 'bg-[#0b1f4b] text-white border-[#0b1f4b]',
    dot: 'bg-[#0b1f4b]',
  },
  homely: {
    label: 'הומלי',
    short: 'H',
    className: 'bg-black text-white border-black',
    solid: 'bg-black text-white border-black',
    dot: 'bg-black',
  },
  webtiv: {
    label: 'Webtiv',
    short: 'W',
    className: 'bg-teal-600 text-white border-teal-600',
    solid: 'bg-teal-600 text-white border-teal-600',
    dot: 'bg-teal-600',
  },
  yad2: {
    label: 'יד-2',
    short: 'Y',
    className: 'bg-orange-500 text-white border-orange-500',
    solid: 'bg-orange-500 text-white border-orange-500',
    dot: 'bg-orange-500',
  },
  external: {
    label: 'חיצוני',
    short: 'E',
    className: 'bg-zinc-600 text-white border-zinc-600',
    solid: 'bg-zinc-600 text-white border-zinc-600',
    dot: 'bg-zinc-500',
  },
};

export function SourceBadge({ source, className, compact }: { source: PropertySource; className?: string; compact?: boolean }) {
  const meta = META[source] ?? META.external;
  return (
    <span
      title={meta.label}
      className={cn(
        'inline-flex items-center justify-center rounded-full border font-bold whitespace-nowrap',
        compact
          ? `h-5 w-5 text-[11px] leading-none ${meta.solid}`
          : `px-2 py-0.5 text-[10px] font-semibold ${meta.className}`,
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

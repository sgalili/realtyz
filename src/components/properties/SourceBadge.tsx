import { Home, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PropertySource = 'mine' | 'homely' | 'webtiv' | 'yad2' | 'madlan' | 'external';

const META: Record<PropertySource, { label: string; short: string; className: string }> = {
  mine: { label: 'המאגר שלי', short: 'שלי', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  homely: { label: 'הומלי', short: 'H', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  webtiv: { label: 'Webtiv', short: 'W', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  yad2: { label: 'יד-2', short: 'Y2', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  madlan: { label: 'מדל״ן', short: 'M', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  external: { label: 'חיצוני', short: 'ext', className: 'bg-slate-50 text-slate-700 border-slate-200' },
};

export function SourceBadge({ source, className, compact }: { source: PropertySource; className?: string; compact?: boolean }) {
  const meta = META[source] ?? META.external;
  const Icon = source === 'mine' ? Home : ExternalLink;
  return (
    <span
      title={meta.label}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap',
        meta.className,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {compact ? meta.short : meta.label}
    </span>
  );
}

export function sourceLabel(source: PropertySource): string {
  return (META[source] ?? META.external).label;
}

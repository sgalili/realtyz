import { cn } from '@/lib/utils';

export type PropertySource = 'mine' | 'homely' | 'webtiv' | 'yad2' | 'external';

// Minimalist dot-only source indicators (no text labels).
//   Homely      → black   #000000
//   Yad2        → orange  #FF7A00
//   Our storage → blue    #0E7EE6
const META: Record<PropertySource, { label: string; short: string; color: string }> = {
  mine: { label: 'המאגר שלי', short: 'ש', color: '#0E7EE6' },
  homely: { label: 'הומלי', short: 'H', color: '#000000' },
  webtiv: { label: 'Webtiv', short: 'W', color: '#0d9488' },
  yad2: { label: 'יד-2', short: 'Y', color: '#FF7A00' },
  external: { label: 'חיצוני', short: 'E', color: '#52525b' },
};

export function SourceBadge({
  source,
  className,
  compact,
}: {
  source: PropertySource;
  className?: string;
  /** kept for API compatibility — renders a slightly smaller dot */
  compact?: boolean;
}) {
  const meta = META[source] ?? META.external;
  return (
    <span
      title={meta.label}
      aria-label={meta.label}
      role="img"
      className={cn(
        'inline-block shrink-0 rounded-full ring-1 ring-black/10',
        compact ? 'h-2 w-2' : 'h-2.5 w-2.5',
        className,
      )}
      style={{ backgroundColor: meta.color }}
    />
  );
}

export function sourceLabel(source: PropertySource): string {
  return (META[source] ?? META.external).label;
}

export function sourceColor(source: PropertySource): string {
  return (META[source] ?? META.external).color;
}

export function sourceDotClass(_source: PropertySource): string {
  return 'rounded-full';
}

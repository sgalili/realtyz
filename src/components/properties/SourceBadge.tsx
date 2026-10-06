import { cn } from '@/lib/utils';
import { useHomelyConnection } from '@/hooks/useHomelyConnection';

export type PropertySource = 'mine' | 'homely' | 'webtiv' | 'yad2' | 'external';

// Minimalist dot-only source indicators (no text labels).
//   Homely      → black   #000000
//   Yad2        → orange  #FF7A00
//   Our storage → blue    #0E7EE6
const META: Record<PropertySource, { label: string; short: string; color: string }> = {
  mine: { label: 'הנכסים שלי', short: 'ש', color: 'hsl(var(--deal-blue))' },
  homely: { label: 'הומלי', short: 'H', color: 'hsl(var(--deal-blue))' },
  webtiv: { label: 'Webtiv', short: 'W', color: 'hsl(var(--social-sms))' },
  yad2: { label: 'יד 2', short: 'Y', color: 'hsl(var(--sale))' },
  external: { label: 'חיצוני', short: 'E', color: 'hsl(var(--muted-foreground))' },
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
  const { connected } = useHomelyConnection();
  if (source === 'homely' && !connected) return null;
  const meta = META[source] ?? META.external;
  return (
    <span
      title={meta.label}
      aria-label={meta.label}
      role="img"
      className={cn(
        'inline-block shrink-0 rounded-full ring-1 ring-border',
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

export function sourceDotClass(source: PropertySource): string {
  return ({ mine: 'bg-primary', homely: 'bg-primary', yad2: 'bg-sale', webtiv: 'bg-social-sms', external: 'bg-muted-foreground' })[source] ?? 'bg-muted-foreground';
}

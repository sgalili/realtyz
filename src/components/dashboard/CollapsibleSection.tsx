/**
 * CollapsibleSection
 * ------------------
 * Dashboard section wrapper that can be collapsed / expanded.
 * Only one peer section is expanded at a time.
 */
import { useEffect, type ReactNode } from 'react';
import { useExclusiveExpansion } from '@/hooks/useExclusiveExpansion';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  id: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Semantic color token name used for the icon badge and accent edge. */
  tone?: string;
  /** Live counter shown on the header. */
  badge?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  id,
  title,
  description,
  icon,
  tone,
  badge,
  defaultOpen = false,
  className,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useExclusiveExpansion('dashboard-sections', id);

  useEffect(() => { if (defaultOpen) setOpen(true); }, [defaultOpen, setOpen]);

  return (
    <section className={cn('overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm', tone && 'border-s-4', className)} style={tone ? { borderInlineStartColor: `hsl(var(--${tone}))` } : undefined} dir="rtl">
      <Button variant="ghost"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-muted/40 transition-colors rounded-xl"
      >
        {tone ? <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl [&_svg]:!h-6 [&_svg]:!w-6" style={{ background: `hsl(var(--${tone}) / 0.14)`, color: `hsl(var(--${tone}))` }}>{icon}</span> : icon}
        <span className="flex-1 min-w-0">
          <span className="block text-base font-bold text-foreground truncate">{title}</span>
          {description && (
            <span className="block text-xs text-muted-foreground truncate">{description}</span>
          )}
        </span>
        {badge !== undefined && badge !== null && <span className="shrink-0 rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums" style={tone ? { background: `hsl(var(--${tone}) / 0.14)`, color: `hsl(var(--${tone}))` } : undefined}>{badge}</span>}
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
       </Button>
       <AnimatedExpansion open={open}><div className="px-1 pb-1">{children}</div></AnimatedExpansion>
    </section>
  );
}

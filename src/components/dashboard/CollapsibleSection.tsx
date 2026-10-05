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
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  id,
  title,
  description,
  icon,
  defaultOpen = false,
  className,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useExclusiveExpansion('dashboard-sections', id);

  useEffect(() => { if (defaultOpen) setOpen(true); }, [defaultOpen, setOpen]);

  return (
    <section className={cn('rounded-xl border border-border/60 bg-card/40', className)} dir="rtl">
      <Button variant="ghost"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-muted/40 transition-colors rounded-xl"
      >
        {icon}
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-foreground truncate">{title}</span>
          {description && (
            <span className="block text-[11px] text-muted-foreground truncate">{description}</span>
          )}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
       </Button>
       <AnimatedExpansion open={open}><div className="px-1 pb-1">{children}</div></AnimatedExpansion>
    </section>
  );
}

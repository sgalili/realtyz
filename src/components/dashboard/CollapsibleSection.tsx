/**
 * CollapsibleSection
 * ------------------
 * Dashboard section wrapper that can be collapsed / expanded.
 * Default state is collapsed, and the last state per section is persisted in
 * localStorage so it survives refresh, navigation, and sign-out / sign-in.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_PREFIX = 'realtyz.dashboard.section.';

function readState(id: string, defaultOpen: boolean): boolean {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
    if (raw === 'open') return true;
    if (raw === 'closed') return false;
  } catch {
    /* ignore */
  }
  return defaultOpen;
}

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
  const [open, setOpen] = useState(() => readState(id, defaultOpen));

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${id}`, open ? 'open' : 'closed');
    } catch {
      /* ignore */
    }
  }, [id, open]);

  return (
    <section className={cn('rounded-xl border border-border/60 bg-card/40', className)} dir="rtl">
      <button
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
      </button>
      {open && <div className="px-1 pb-1">{children}</div>}
    </section>
  );
}

import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

// Framed card that shows only its title until opened, then grows slowly and smoothly.
export function CollapsibleCard({ title, open, onToggle, children, className }: { title: ReactNode; open: boolean; onToggle: () => void; children: ReactNode; className?: string }) {
  return (
    <section dir="rtl" className={cn('rounded-xl border bg-card', className)}>
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-center justify-between gap-2 p-4 text-start focus-visible:outline-none">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-700 ease-in-out motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      <div className={cn('grid transition-[grid-template-rows,opacity] duration-700 ease-in-out motion-reduce:transition-none', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <div className="overflow-hidden" inert={!open ? '' as unknown as boolean : undefined}>
          <div className="space-y-3 px-4 pb-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

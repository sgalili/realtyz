import { Check, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Unified multi-select controls: a small list icon toggles selection mode.
 * When active, a "בחר הכל" button and a selected counter appear next to it
 * in the same row, and square checkboxes show on every record. No dropdown menu.
 */
export const SelectModeToggle = ({
  active,
  onToggle,
  count = 0,
  total,
  onSelectAll,
  className,
}: { active: boolean; onToggle: () => void; count?: number; total?: number; onSelectAll?: () => void; className?: string }) => {
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-2" dir="rtl">
      <Button
        variant="ghost"
        size="icon"
        type="button"
        aria-label="בחירה מרובה"
        title="בחירה מרובה"
        aria-pressed={active}
        onClick={onToggle}
        className={cn(
          'relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition',
          active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
          className,
        )}
      >
        <ListChecks className="h-4 w-4" />
      </Button>
      {active && onSelectAll && (
        <button
          type="button"
          onClick={onSelectAll}
          className="text-[13px] font-semibold text-primary hover:underline"
        >
          {allSelected ? 'בטל הכל' : 'בחר הכל'}
        </button>
      )}
      {active && count > 0 && (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-bold text-primary tabular-nums">
          {count} נבחרו
        </span>
      )}
    </div>
  );
};

export const SelectBox = ({
  checked,
  indeterminate,
  onChange,
  label,
  className,
}: { checked: boolean; indeterminate?: boolean; onChange: () => void; label?: string; className?: string }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={indeterminate ? 'mixed' : checked}
    aria-label={label ?? 'בחירה'}
    onClick={(e) => { e.stopPropagation(); onChange(); }}
    className={cn(
      'h-4 w-4 shrink-0 rounded border flex items-center justify-center transition',
      checked ? 'border-primary bg-primary text-primary-foreground'
        : indeterminate ? 'border-primary bg-primary/30' : 'border-border bg-background',
      className,
    )}
  >
    {checked && <Check className="h-3 w-3" />}
    {!checked && indeterminate && <span className="h-0.5 w-2 rounded bg-primary-foreground" />}
  </button>
);

export const SelectAllRow = ({
  total,
  selected,
  onToggle,
  children,
  className,
}: { total: number; selected: number; onToggle: () => void; children?: React.ReactNode; className?: string }) => {
  const all = total > 0 && selected === total;
  if (total === 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-2 bg-muted/40 px-3 py-2 border-b border-border', className)} dir="rtl">
      <SelectBox checked={all} indeterminate={selected > 0 && !all} onChange={onToggle} label={all ? 'בטל בחירה' : 'בחר הכל'} />
      <button type="button" onClick={onToggle} className="text-[14px] font-semibold text-foreground">
        {all ? 'בטל הכל' : 'בחר הכל'}
      </button>
      {selected > 0 && (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-bold text-primary tabular-nums">{selected} נבחרו</span>
      )}
      {selected > 0 && <div className="ms-auto flex flex-wrap items-center gap-1.5">{children}</div>}
    </div>
  );
};

/**
 * ScheduleViews
 * -------------
 * Shared list/calendar switch plus month grid, used by BOTH the tours tab and
 * the tasks tab so the display toggle behaves identically in each of them.
 */
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { CalendarDays, ChevronLeft, ChevronRight, List } from 'lucide-react';

export type ScheduleView = 'list' | 'calendar';

export type ScheduleItem = {
  id: string;
  /** ISO timestamp the item is scheduled for. */
  at: string | null;
  label: string;
};

const DAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

export function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function todayKey() {
  return dayKey(new Date().toISOString());
}

export function startOfThisMonth() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** List / calendar switch with month navigation while the calendar is active. */
export function ScheduleViewToggle({
  view,
  onViewChange,
  monthCursor,
  onMonthChange,
}: {
  view: ScheduleView;
  onViewChange: (v: ScheduleView) => void;
  monthCursor: Date;
  onMonthChange: (d: Date) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="מצב תצוגה">
        <Button
          size="icon"
          variant="outline"
          aria-label={view === 'list' ? 'מעבר לתצוגת לוח שנה' : 'מעבר לתצוגת רשימה'}
          title={view === 'list' ? 'לוח שנה' : 'רשימה'}
          className="h-10 w-10 rounded-md bg-background shadow-none"
          onClick={() => onViewChange(view === 'list' ? 'calendar' : 'list')}
        >
          {view === 'list' ? <CalendarDays className="h-5 w-5" /> : <List className="h-5 w-5" />}
        </Button>
      </div>
    </div>
  );
}

/**
 * Month navigation. Rendered on its own row above the calendar grid so it can
 * never overlap the section tabs on narrow screens.
 */
export function ScheduleMonthNav({
  monthCursor,
  onMonthChange,
}: {
  monthCursor: Date;
  onMonthChange: (d: Date) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        aria-label="חודש קודם"
        onClick={() => onMonthChange(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <span className="min-w-[7.5rem] text-center text-sm font-semibold">
        {monthCursor.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        aria-label="חודש הבא"
        onClick={() => onMonthChange(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** Month grid + the selected day's items, rendered by the caller. */
export function ScheduleMonthGrid<T extends ScheduleItem>({
  items,
  monthCursor,
  openDay,
  onOpenDay,
  renderItem,
  emptyLabel = 'אין פריטים ביום שנבחר',
}: {
  items: T[];
  monthCursor: Date;
  openDay: string | null;
  onOpenDay: (k: string) => void;
  renderItem: (item: T) => React.ReactNode;
  emptyLabel?: string;
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const item of items) {
      if (!item.at) continue;
      const k = dayKey(item.at);
      map.set(k, [...(map.get(k) ?? []), item]);
    }
    return map;
  }, [items]);

  const cells = useMemo(() => {
    const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
    const out: Array<Date | null> = Array.from({ length: startOffset }, () => null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      out.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d));
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [monthCursor]);

  const selected = openDay ? byDay.get(openDay) ?? [] : [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted-foreground">
        {DAY_LABELS.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="h-16 rounded-md bg-muted/10" />;
          const k = dayKey(d.toISOString());
          const list = byDay.get(k) ?? [];
          const isSelected = openDay === k;
          const isToday = k === todayKey();
          return (
            <button
              key={k}
              type="button"
              onClick={() => onOpenDay(k)}
              className={`h-16 rounded-md border p-1 text-right transition-colors ${
                isSelected ? 'border-primary bg-primary/10' : 'bg-muted/20 hover:bg-muted/40'
              } ${isToday ? 'ring-1 ring-primary/50' : ''}`}
            >
              <span className="block text-[11px] font-semibold text-foreground">{d.getDate()}</span>
              <span className="mt-0.5 block space-y-0.5">
                {list.slice(0, 2).map((item) => (
                  <span key={item.id} className="block truncate rounded bg-primary/15 px-1 text-[10px] text-primary">
                    {item.at ? `${formatTime(item.at)} ` : ''}{item.label}
                  </span>
                ))}
                {list.length > 2 ? (
                  <span className="block text-[10px] text-muted-foreground">+{list.length - 2}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="space-y-2">
        {selected.length === 0 ? (
          <p className="py-2 text-center text-[13px] text-muted-foreground">{emptyLabel}</p>
        ) : (
          selected.map((item) => renderItem(item))
        )}
      </div>
    </div>
  );
}

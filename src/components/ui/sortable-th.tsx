import { useMemo, useState, useCallback } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortDir = 'asc' | 'desc';
export type SortState<K extends string = string> = { key: K | null; dir: SortDir };

export function useTableSort<K extends string = string>(initial: SortState<K> = { key: null, dir: 'asc' }) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const toggle = useCallback((key: K) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  }, []);
  return { sort, toggle, setSort };
}

/** Generic comparator: numbers, strings (he-IL), dates, null-safe. */
export function compareValues(a: unknown, b: unknown, dir: SortDir = 'asc'): number {
  const mul = dir === 'asc' ? 1 : -1;
  const aNull = a === null || a === undefined || a === '';
  const bNull = b === null || b === undefined || b === '';
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * mul;
  const da = a instanceof Date ? a.getTime() : NaN;
  const db = b instanceof Date ? b.getTime() : NaN;
  if (!isNaN(da) && !isNaN(db)) return (da - db) * mul;
  return String(a).localeCompare(String(b), 'he-IL', { numeric: true, sensitivity: 'base' }) * mul;
}

export function sortRows<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
  accessor: (row: T, key: K) => unknown,
): T[] {
  if (!sort.key) return rows;
  const key = sort.key;
  return [...rows].sort((a, b) => compareValues(accessor(a, key), accessor(b, key), sort.dir));
}

interface SortableThProps<K extends string> extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
}

export function SortableTh<K extends string>({
  sortKey, sort, onSort, className, children, ...rest
}: SortableThProps<K>) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      {...rest}
      onClick={(e) => { onSort(sortKey); rest.onClick?.(e); }}
      className={cn(
        'cursor-pointer select-none transition-colors hover:bg-muted',
        active && 'text-primary',
        className,
      )}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <Icon className={cn('h-3 w-3', active ? 'opacity-100' : 'opacity-40')} />
      </span>
    </th>
  );
}

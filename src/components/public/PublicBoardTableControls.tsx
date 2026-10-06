import { useMemo, useState, type ReactNode } from 'react';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, horizontalListSortingStrategy, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, Columns3, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { PublicCard } from '@/pages/PublicListingsBoard';

export const BOARD_COLUMNS = [
  { id: 'photo', label: 'תמונה' }, { id: 'address', label: 'כותרת' },
  { id: 'deal', label: 'עסקה' }, { id: 'price', label: 'מחיר' },
  { id: 'rooms', label: 'חדרים' }, { id: 'sqm', label: 'מ״ר' }, { id: 'floor', label: 'קומה' },
] as const;
export type BoardColumnId = typeof BOARD_COLUMNS[number]['id'];
type Preferences = { order: BoardColumnId[]; hidden: BoardColumnId[]; sort: { id: BoardColumnId; descending: boolean } | null };
const defaults = (): Preferences => ({ order: BOARD_COLUMNS.map(c => c.id), hidden: [], sort: null });
const validId = (id: unknown): id is BoardColumnId => BOARD_COLUMNS.some(c => c.id === id);
function read(key: string): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (!saved) return defaults();
    const order = Array.isArray(saved.order) ? [...new Set<BoardColumnId>(saved.order.filter(validId))] : [];
    BOARD_COLUMNS.forEach(c => { if (!order.includes(c.id)) order.push(c.id); });
    const hidden: BoardColumnId[] = Array.isArray(saved.hidden) ? [...new Set<BoardColumnId>(saved.hidden.filter(validId))] : [];
    return { order, hidden: hidden.length < order.length ? hidden : [], sort: validId(saved.sort?.id) ? { id: saved.sort.id, descending: saved.sort.descending === true } : null };
  } catch { return defaults(); }
}
function sortValue(card: PublicCard, id: BoardColumnId): string | number | null {
  switch (id) {
    case 'photo': return card.photos?.length || 0;
    case 'address': return [card.street, card.neighborhood, card.city].filter(Boolean).join(', ') || null;
    case 'deal': return card.deal_type === 'rent' ? 'להשכרה' : 'למכירה';
    default: return card[id];
  }
}
export function usePublicBoardColumns(identity: string, rows: PublicCard[]) {
  const key = `public-board-columns:v1:${identity}`;
  const [stored, setStored] = useState(() => ({ key, prefs: read(key) }));
  const prefs = useMemo(() => stored.key === key ? stored.prefs : read(key), [stored, key]);
  const update = (next: Preferences) => {
    setStored({ key, prefs: next });
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Storage may be disabled. */ }
  };
  const visible = prefs.order.filter(id => !prefs.hidden.includes(id));
  const sorted = useMemo(() => {
    const sort = prefs.sort;
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const av = sortValue(a, sort.id), bv = sortValue(b, sort.id);
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'he', { numeric: true });
      return sort.descending ? -result : result;
    });
  }, [rows, prefs.sort]);
  return {
    visible, sorted, sort: prefs.sort,
    toggleSort: (id: BoardColumnId) => update({ ...prefs, sort: { id, descending: prefs.sort?.id === id ? !prefs.sort.descending : false } }),
    reorder: ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id || !validId(active.id) || !validId(over.id)) return;
      update({ ...prefs, order: arrayMove(prefs.order, prefs.order.indexOf(active.id), prefs.order.indexOf(over.id)) });
    },
    toggleVisible: (id: BoardColumnId) => {
      if (visible.length === 1 && visible.includes(id)) return;
      update({ ...prefs, hidden: prefs.hidden.includes(id) ? prefs.hidden.filter(c => c !== id) : [...prefs.hidden, id] });
    },
    reset: () => update(defaults()),
  };
}
export type BoardColumnControls = ReturnType<typeof usePublicBoardColumns>;
export function BoardColumnDragArea({ controls, children }: { controls: BoardColumnControls; children: ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={controls.reorder}><SortableContext items={controls.visible} strategy={horizontalListSortingStrategy}>{children}</SortableContext></DndContext>;
}
export function BoardColumnHeader({ id, controls }: { id: BoardColumnId; controls: BoardColumnControls }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const label = BOARD_COLUMNS.find(c => c.id === id)?.label;
  const sorted = controls.sort?.id === id;
  return <th ref={setNodeRef} data-column={id} aria-sort={sorted ? controls.sort?.descending ? 'descending' : 'ascending' : 'none'} style={{ transform: CSS.Transform.toString(transform), transition }} className={`group/column px-2 pb-0 pt-2 text-right font-semibold ${isDragging ? 'relative z-10 bg-muted opacity-80' : ''}`}>
    <div className="flex items-center gap-0.5 whitespace-nowrap">
      <Button variant="ghost" size="sm" onClick={() => controls.toggleSort(id)} className="h-7 gap-1 px-0 text-xs font-semibold hover:bg-transparent" aria-label={`מיון לפי ${label}`}>
        {label}{sorted && (controls.sort?.descending ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </Button>
      <Button variant="ghost" size="icon" {...attributes} {...listeners} aria-label={`הזזת עמודת ${label}`} title={`הזזת עמודת ${label}`} className="h-7 w-5 touch-none text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover/column:opacity-100 [@media(hover:none)]:opacity-60"><GripVertical className="h-3 w-3" /></Button>
    </div>
  </th>;
}
export function BoardColumnMenu({ controls }: { controls: BoardColumnControls }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" aria-label="התאמת עמודות" title="התאמת עמודות"><Columns3 className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
    {BOARD_COLUMNS.map(c => <DropdownMenuCheckboxItem key={c.id} checked={controls.visible.includes(c.id)} disabled={controls.visible.length === 1 && controls.visible.includes(c.id)} onSelect={e => e.preventDefault()} onCheckedChange={() => controls.toggleVisible(c.id)}>{c.label}</DropdownMenuCheckboxItem>)}
    <DropdownMenuSeparator /><DropdownMenuItem onSelect={controls.reset}>איפוס עמודות</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu>;
}
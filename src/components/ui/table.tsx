import * as React from "react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, horizontalListSortingStrategy, sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Columns3, GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { HorizontalTableScroll } from "./horizontal-table-scroll";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuItem } from "./dropdown-menu";

/* ------------------------------------------------------------------ *
 * App-wide table customization (one solution for every table):
 * click a header to sort asc/desc, drag the grip to reorder columns,
 * hide/show columns from a minimal on-demand menu. Preferences persist
 * per user + workspace + page + table headers in localStorage.
 * Opt out with `sortable={false}`.
 * ------------------------------------------------------------------ */

type Prefs = { order: number[]; hidden: number[]; sort: { index: number; descending: boolean } | null };

function nodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(" ");
  if (React.isValidElement(node)) {
    const el = node as React.ReactElement<any>;
    const own = el.props?.["data-sort-value"];
    if (own !== undefined && own !== null) return String(own);
    return nodeText(el.props?.children);
  }
  return "";
}

const collator = new Intl.Collator("he", { numeric: true, sensitivity: "base" });
function compareText(a: string, b: string): number {
  const av = a.trim(), bv = b.trim();
  if (!av && !bv) return 0;
  if (!av) return 1;
  if (!bv) return -1;
  const an = Number(av.replace(/[^\d.,-]/g, "").replace(/,/g, ""));
  const bn = Number(bv.replace(/[^\d.,-]/g, "").replace(/,/g, ""));
  if (Number.isFinite(an) && Number.isFinite(bn) && /\d/.test(av) && /\d/.test(bv) && an !== bn) return an - bn;
  return collator.compare(av, bv);
}

const elementsOf = (node: React.ReactNode) =>
  React.Children.toArray(node).filter((c) => React.isValidElement(c)) as React.ReactElement<any>[];
const isFragment = (el: React.ReactElement) => el.type === React.Fragment;

const defaults = (n: number): Prefs => ({ order: Array.from({ length: n }, (_, i) => i), hidden: [], sort: null });
function readPrefs(key: string, n: number): Prefs {
  try {
    const s = JSON.parse(localStorage.getItem(key) || "null");
    if (!s) return defaults(n);
    const ok = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < n;
    const order = Array.isArray(s.order) ? [...new Set<number>(s.order.filter(ok))] : [];
    for (let i = 0; i < n; i++) if (!order.includes(i)) order.push(i);
    const hidden = Array.isArray(s.hidden) ? [...new Set<number>(s.hidden.filter(ok))] : [];
    return { order, hidden: hidden.length < n ? hidden : [], sort: ok(s.sort?.index) ? { index: s.sort.index, descending: s.sort.descending === true } : null };
  } catch {
    return defaults(n);
  }
}

type HeaderCtx = {
  sort: Prefs["sort"];
  toggleSort: (i: number) => void;
  canArrange: boolean;
};

function ManagedHeaderCell({ cell, index, label, ctx }: { cell: React.ReactElement<any>; index: number; label: string; ctx: HeaderCtx }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(index), disabled: !ctx.canArrange || !label });
  const p = cell.props;
  const active = ctx.sort?.index === index;
  return React.cloneElement(cell, {
    ref: setNodeRef,
    "data-column-index": index,
    "aria-sort": label ? (active ? (ctx.sort!.descending ? "descending" : "ascending") : "none") : undefined,
    style: { ...p.style, transform: CSS.Transform.toString(transform), transition },
    className: cn(p.className, "group/column", isDragging && "relative z-10 bg-muted opacity-80"),
    children: !label ? p.children : (
      <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
        <button
          type="button"
          onClick={(e) => { p.onClick?.(e); if (!e.defaultPrevented) ctx.toggleSort(index); }}
          className="inline-flex items-center gap-1 font-[inherit] text-[inherit]"
          aria-label={`מיון לפי ${label}`}
        >
          {p.children}
          {active && (ctx.sort!.descending ? <ArrowDown className="h-3 w-3 shrink-0" /> : <ArrowUp className="h-3 w-3 shrink-0" />)}
        </button>
        {ctx.canArrange && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`הזזת עמודת ${label}`}
            title={`הזזת עמודת ${label}`}
            className="inline-flex h-6 w-4 touch-none items-center justify-center text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover/column:opacity-100 [@media(hover:none)]:opacity-60"
          >
            <GripVertical className="h-3 w-3" />
          </button>
        )}
      </span>
    ),
  });
}

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement> & { sortable?: boolean }>(
  ({ className, children, sortable = true, ...props }, ref) => {
    const { user } = useAuth();
    const { activeWorkspaceId } = useWorkspace();

    // Locate header row / labels.
    const parts = elementsOf(children);
    const headEl = parts.find((c) => c.type === TableHeader || c.type === "thead");
    const headRow = headEl ? elementsOf(headEl.props.children)[0] : undefined;
    const headCells = headRow ? elementsOf(headRow.props.children) : [];
    const n = headCells.length;
    const labels = headCells.map((c) => nodeText(c.props.children).trim());

    // Body rows must be plain rows (optionally grouped in fragments) to rearrange safely.
    const bodies = parts.filter((c) => c.type === TableBody || c.type === "tbody");
    const isRow = (el: React.ReactElement) => el.type === TableRow || el.type === "tr";
    const rowFits = (row: React.ReactElement<any>) => {
      const cells = elementsOf(row.props.children);
      return cells.length === n || (cells.length === 1 && Number(cells[0].props.colSpan) > 1);
    };
    const canArrange = sortable && n > 1 && bodies.every((b) =>
      elementsOf(b.props.children).every((item) =>
        isFragment(item) ? elementsOf(item.props.children).every((r) => isRow(r) && rowFits(r)) : isRow(item) && rowFits(item)));

    const pathname = typeof window !== "undefined" ? window.location.pathname.replace(/\/[0-9a-f-]{16,}/gi, "/:id") : "";
    const key = `table-columns:v1:${user?.id ?? "anon"}:${activeWorkspaceId ?? "none"}:${pathname}:${labels.join("|")}`;
    const [stored, setStored] = React.useState<{ key: string; prefs: Prefs } | null>(null);
    const prefs = stored?.key === key ? stored.prefs : readPrefs(key, n);
    const update = (next: Prefs) => {
      setStored({ key, prefs: next });
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage disabled */ }
    };
    const order = canArrange ? prefs.order : defaults(n).order;
    const hidden = canArrange ? prefs.hidden : [];
    const visible = order.filter((i) => !hidden.includes(i));
    const sort = prefs.sort && labels[prefs.sort.index] ? prefs.sort : null;

    const ctx: HeaderCtx = {
      sort,
      canArrange,
      toggleSort: (i) => update({ ...prefs, sort: sort?.index === i ? { index: i, descending: !sort.descending } : { index: i, descending: false } }),
    };

    const arrangeRow = (row: React.ReactElement<any>): React.ReactElement => {
      if (!canArrange) return row;
      const cells = elementsOf(row.props.children);
      if (cells.length !== n) {
        if (cells.length === 1 && Number(cells[0].props.colSpan) >= n) {
          return React.cloneElement(row, {}, React.cloneElement(cells[0], { colSpan: visible.length }));
        }
        return row;
      }
      return React.cloneElement(row, {}, visible.map((i) => cells[i]));
    };

    let content: React.ReactNode = children;
    let headDone = false;
    if (sortable && n > 0) {
      content = React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        const el = child as React.ReactElement<any>;
        if (el.type === headEl?.type && !headDone) {
          headDone = true;
          const rows = elementsOf(el.props.children);
          const first = rows[0];
          const managed = visible.map((i) => (
            <ManagedHeaderCell key={`col-${i}`} cell={headCells[i]} index={i} label={labels[i]} ctx={ctx} />
          ));
          return React.cloneElement(el, {}, [React.cloneElement(first, { key: first.key ?? "head" }, managed), ...rows.slice(1).map(arrangeRow)]);
        }
        if (el.type === TableBody || el.type === "tbody" || el.type === TableFooter || el.type === "tfoot") {
          let items = elementsOf(el.props.children);
          if (sort && el.type !== TableFooter && el.type !== "tfoot") {
            const primary = (item: React.ReactElement<any>) => (isFragment(item) ? elementsOf(item.props.children)[0] : item);
            const sortable = items.every((it) => { const p = primary(it); return p && elementsOf(p.props.children).length === n; });
            if (sortable && items.length > 1) {
              items = items
                .map((it, i) => ({ it, i, t: nodeText(elementsOf(primary(it).props.children)[sort.index]) }))
                .sort((a, b) => { const c = compareText(a.t, b.t); return (c !== 0 ? c : a.i - b.i) * (sort.descending ? -1 : 1); })
                .map((x) => x.it);
            }
          }
          const arranged = items.map((it) =>
            isFragment(it) ? React.cloneElement(it, {}, elementsOf(it.props.children).map(arrangeRow)) : arrangeRow(it));
          return React.cloneElement(el, {}, arranged);
        }
        return child;
      });
    }

    const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );
    const onDragEnd = ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return;
      const a = Number(active.id), b = Number(over.id);
      update({ ...prefs, order: arrayMove(prefs.order, prefs.order.indexOf(a), prefs.order.indexOf(b)) });
    };
    const toggleVisible = (i: number) => {
      if (visible.length === 1 && visible.includes(i)) return;
      update({ ...prefs, hidden: prefs.hidden.includes(i) ? prefs.hidden.filter((c) => c !== i) : [...prefs.hidden, i] });
    };

    const table = (
      <table ref={ref} className={cn("w-full min-w-max caption-bottom text-sm", className)} {...props}>
        {content}
      </table>
    );

    return (
      <div className="group/table relative min-w-0 w-full max-w-full">
        {canArrange && (
          <div className="absolute end-0 top-0 z-20 opacity-0 transition-opacity focus-within:opacity-100 group-hover/table:opacity-100 [@media(hover:none)]:opacity-70">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground hover:text-foreground" aria-label="התאמת עמודות" title="התאמת עמודות">
                  <Columns3 className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {prefs.order.filter((i) => labels[i]).map((i) => (
                  <DropdownMenuCheckboxItem
                    key={i}
                    checked={!hidden.includes(i)}
                    disabled={visible.length === 1 && visible.includes(i)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggleVisible(i)}
                  >
                    {labels[i]}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => update(defaults(n))}>איפוס עמודות</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <HorizontalTableScroll>
          {canArrange ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={visible.map(String)} strategy={horizontalListSortingStrategy}>{table}</SortableContext>
            </DndContext>
          ) : table}
        </HorizontalTableScroll>
      </div>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />,
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn("border-b transition-colors data-[state=selected]:bg-muted hover:bg-muted/50", className)} {...props} />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn("h-12 px-1 text-right align-middle font-semibold text-xs text-muted-foreground [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("px-1 py-4 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />,
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };

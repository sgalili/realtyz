import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Global interactive sorting
 *
 * Every table built on this primitive gains click-to-sort headers for
 * free: the Table component inspects its own children, decorates the
 * header cells with a toggle + direction indicator, and reorders the
 * body rows client-side. Tables can opt out with `sortable={false}`.
 * ------------------------------------------------------------------ */

type SortState = { index: number; dir: "asc" | "desc" } | null;

/** Flatten any React node into comparable plain text. */
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
  const av = a.trim();
  const bv = b.trim();
  if (!av && !bv) return 0;
  if (!av) return 1;
  if (!bv) return -1;
  const an = Number(av.replace(/[^\d.,-]/g, "").replace(/,/g, ""));
  const bn = Number(bv.replace(/[^\d.,-]/g, "").replace(/,/g, ""));
  if (Number.isFinite(an) && Number.isFinite(bn) && /\d/.test(av) && /\d/.test(bv)) {
    if (an !== bn) return an - bn;
  }
  return collator.compare(av, bv);
}

function cellsOf(row: React.ReactElement): React.ReactNode[] {
  return React.Children.toArray((row.props as any)?.children).filter((c) => React.isValidElement(c));
}

function isType(el: React.ReactElement, target: React.ElementType): boolean {
  return el.type === target;
}

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & { sortable?: boolean }
>(({ className, children, sortable = true, ...props }, ref) => {
  const [sort, setSort] = React.useState<SortState>(null);

  const toggle = (index: number) =>
    setSort((prev) =>
      !prev || prev.index !== index ? { index, dir: "asc" } : prev.dir === "asc" ? { index, dir: "desc" } : null,
    );

  const decorated = React.useMemo(() => {
    if (!sortable) return children;

    let headerCount = 0;

    const withHeaders = React.Children.map(children, (child) => {
      if (!React.isValidElement(child) || !isType(child, TableHeader)) return child;
      const rows = React.Children.toArray((child.props as any).children);
      const nextRows = rows.map((row, rowIdx) => {
        if (!React.isValidElement(row) || rowIdx > 0) return row;
        const cells = React.Children.toArray((row.props as any).children);
        headerCount = cells.filter((c) => React.isValidElement(c)).length;
        let i = -1;
        const nextCells = cells.map((cell) => {
          if (!React.isValidElement(cell)) return cell;
          i += 1;
          const index = i;
          const cellProps = cell.props as any;
          const label = nodeText(cellProps.children).trim();
          if (!label) return cell;
          const active = sort?.index === index;
          const Icon = !active ? ChevronsUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
          return React.cloneElement(cell as React.ReactElement<any>, {
            className: cn(cellProps.className, "cursor-pointer select-none"),
            onClick: (e: React.MouseEvent) => {
              cellProps.onClick?.(e);
              if (e.defaultPrevented) return;
              toggle(index);
            },
            "aria-sort": active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none",
            children: (
              <span className="inline-flex items-center gap-1">
                {cellProps.children}
                <Icon className={cn("h-3 w-3 shrink-0", active ? "text-foreground" : "opacity-40")} />
              </span>
            ),
          });
        });
        return React.cloneElement(row as React.ReactElement<any>, {}, nextCells);
      });
      return React.cloneElement(child as React.ReactElement<any>, {}, nextRows);
    });

    if (!sort) return withHeaders;

    return React.Children.map(withHeaders, (child) => {
      if (!React.isValidElement(child) || !isType(child, TableBody)) return child;
      const rows = React.Children.toArray((child.props as any).children);
      const elementRows = rows.filter((r) => React.isValidElement(r)) as React.ReactElement[];
      // Bail out on mixed layouts (spanning rows, empty states, loaders).
      if (elementRows.length !== rows.length || elementRows.length < 2) return child;
      if (headerCount && elementRows.some((r) => cellsOf(r).length !== headerCount)) return child;
      const keyed = elementRows.map((row, i) => ({
        row,
        i,
        text: nodeText(cellsOf(row)[sort.index]),
      }));
      keyed.sort((a, b) => {
        const c = compareText(a.text, b.text);
        return (c !== 0 ? c : a.i - b.i) * (sort.dir === "asc" ? 1 : -1);
      });
      return React.cloneElement(
        child as React.ReactElement<any>,
        {},
        keyed.map((k) => k.row),
      );
    });
  }, [children, sortable, sort]);

  return (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props}>
        {decorated}
      </table>
    </div>
  );
});
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
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
    <tr
      ref={ref}
      className={cn("border-b transition-colors data-[state=selected]:bg-muted hover:bg-muted/50", className)}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-12 px-1 text-right align-middle font-semibold text-xs text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
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
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };

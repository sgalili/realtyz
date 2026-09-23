import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * App-wide, invisible column drag & drop for every <table>.
 * Users drag a header cell onto another header cell to reorder columns.
 * Order is remembered per user + page + table (localStorage).
 * Cells keep their React identity; only their position inside the row moves.
 */
const ORIG = "data-col-orig";

function headerRow(table: HTMLTableElement): HTMLTableRowElement | null {
  return (table.tHead?.rows[0] as HTMLTableRowElement | undefined) ?? null;
}

function cellsOf(row: HTMLTableRowElement): HTMLElement[] {
  return Array.from(row.children).filter((c) => c.tagName === "TH" || c.tagName === "TD") as HTMLElement[];
}

function stampRow(row: HTMLTableRowElement) {
  const cells = cellsOf(row);
  const stamped = cells.filter((c) => c.hasAttribute(ORIG)).length;
  if (stamped === cells.length) return;
  // Row is new or React added/removed cells: restamp in current DOM order only if nothing moved yet.
  if (stamped === 0 || row.dataset.colMoved !== "1") {
    cells.forEach((c, i) => c.setAttribute(ORIG, String(i)));
  } else {
    // Assign unstamped cells the next free indices (best effort).
    const used = new Set(cells.map((c) => c.getAttribute(ORIG)).filter(Boolean));
    let n = 0;
    cells.forEach((c) => {
      if (c.hasAttribute(ORIG)) return;
      while (used.has(String(n))) n++;
      c.setAttribute(ORIG, String(n));
      used.add(String(n));
    });
  }
}

function applyOrder(row: HTMLTableRowElement, order: number[]) {
  const cells = cellsOf(row);
  if (cells.some((c) => c.colSpan > 1)) return;
  stampRow(row);
  const byOrig = new Map(cells.map((c) => [Number(c.getAttribute(ORIG)), c]));
  const sequence: HTMLElement[] = [];
  order.forEach((i) => { const c = byOrig.get(i); if (c) { sequence.push(c); byOrig.delete(i); } });
  byOrig.forEach((c) => sequence.push(c));
  const already = sequence.every((c, i) => cells[i] === c);
  if (already) return;
  sequence.forEach((c) => row.appendChild(c));
  row.dataset.colMoved = "1";
}

export default function TableColumnReorder() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;

    const keyFor = (table: HTMLTableElement) => {
      const head = headerRow(table);
      if (!head) return null;
      stampRow(head);
      const labels = cellsOf(head)
        .sort((a, b) => Number(a.getAttribute(ORIG)) - Number(b.getAttribute(ORIG)))
        .map((c) => (c.textContent ?? "").replace(/[▲▼\s]+/g, " ").trim());
      return `realtyz:colorder:${uid}:${pathname.replace(/\/[0-9a-f-]{16,}/gi, "/:id")}:${labels.join("|")}`;
    };

    const readOrder = (key: string): number[] | null => {
      try { const v = JSON.parse(localStorage.getItem(key) ?? "null"); return Array.isArray(v) ? v : null; } catch { return null; }
    };

    const applyTable = (table: HTMLTableElement) => {
      const key = keyFor(table);
      if (!key) return;
      const order = readOrder(key);
      if (!order) return;
      Array.from(table.rows).forEach((r) => applyOrder(r as HTMLTableRowElement, order));
    };

    let dragged: HTMLElement | null = null;

    const wire = (table: HTMLTableElement) => {
      const head = headerRow(table);
      if (!head) return;
      cellsOf(head).forEach((th) => {
        if (th.dataset.colDnd === "1") return;
        th.dataset.colDnd = "1";
        th.draggable = true;
        th.addEventListener("dragstart", (e) => {
          dragged = th;
          e.dataTransfer?.setData("text/plain", "col");
          if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
          th.style.opacity = "0.5";
        });
        th.addEventListener("dragend", () => { th.style.opacity = ""; dragged = null; });
        th.addEventListener("dragover", (e) => {
          if (dragged && dragged !== th && dragged.parentElement === th.parentElement) e.preventDefault();
        });
        th.addEventListener("drop", (e) => {
          e.preventDefault();
          if (!dragged || dragged === th || dragged.parentElement !== th.parentElement) return;
          const key = keyFor(table);
          if (!key) return;
          const current = cellsOf(head).map((c) => Number(c.getAttribute(ORIG)));
          const from = Number(dragged.getAttribute(ORIG));
          const to = Number(th.getAttribute(ORIG));
          const next = current.filter((i) => i !== from);
          next.splice(next.indexOf(to) + (current.indexOf(from) < current.indexOf(to) ? 1 : 0), 0, from);
          localStorage.setItem(key, JSON.stringify(next));
          Array.from(table.rows).forEach((r) => applyOrder(r as HTMLTableRowElement, next));
        });
      });
    };

    let scheduled = false;
    const scan = () => {
      scheduled = false;
      document.querySelectorAll<HTMLTableElement>("table").forEach((t) => {
        if (!headerRow(t)) return;
        wire(t);
        applyTable(t);
      });
    };
    const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(scan); } };

    scan();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [user?.id, pathname]);

  return null;
}

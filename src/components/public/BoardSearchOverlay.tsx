import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';

export const BOARD_SEARCH_OPEN_EVENT = 'toraff:board-search-open';
export const BOARD_SEARCH_STATE_EVENT = 'toraff:board-search-state';
export const BOARD_VIEW_TOGGLE_EVENT = 'toraff:board-view-toggle';
export const BOARD_VIEW_STATE_EVENT = 'toraff:board-view-state';

/** Full-page search: free text on top, all filters under one "חיפוש מתקדם" row. */
export default function BoardSearchOverlay({ open, onClose, query, onQueryChange, onSearch, filters, resultCount, dealType, onDealTypeChange }: {
  dealType: string; onDealTypeChange: (v: string) => void;
  open: boolean; onClose: () => void; query: string; onQueryChange: (v: string) => void; onSearch: () => void; filters: ReactNode; resultCount: number;
}) {
  const [advanced, setAdvanced] = useState(false);
  const [top, setTop] = useState(0);
  useEffect(() => { if (open) setTop(Math.max(0, document.querySelector('header')?.getBoundingClientRect().bottom ?? 0)); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  // Keep mounted through the exit animation; reveal top-to-bottom via clip-path (GPU-composited, 60fps).
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(() => setMounted(false), reduce ? 0 : 560);
    return () => window.clearTimeout(t);
  }, [open]);

  // Collapsed, the panel must end right after the "חיפוש מתקדם" row: no empty
  // area under it. Expanded, it grows to the bottom of the screen. Both heights
  // are measured in px so the change can animate.
  const panelRef = useRef<HTMLDivElement>(null);
  const [collapsedHeight, setCollapsedHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  useLayoutEffect(() => {
    const measure = () => {
      const panel = panelRef.current;
      const head = panel?.querySelector<HTMLElement>('[data-search-head]');
      const foot = panel?.querySelector<HTMLElement>('[data-search-foot]');
      const body = panel?.querySelector<HTMLElement>('[data-search-body]');
      if (!head || !foot || !body) return;
      const next = head.offsetHeight + body.offsetHeight + foot.offsetHeight;
      setCollapsedHeight(prev => (Math.abs(prev - next) > 0.5 ? next : prev));
    };
    measure();
    const targets = [panelRef.current?.querySelector('[data-search-head]'), panelRef.current?.querySelector('[data-search-foot]'), panelRef.current?.querySelector('[data-search-body]')]
      .filter((el): el is Element => Boolean(el));
    const observer = new ResizeObserver(measure);
    targets.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [mounted]);
  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!mounted) return null;
  const submit = () => { if (query.trim()) onSearch(); onClose(); };
  const available = Math.max(0, viewportHeight - top);
  const height = advanced ? available : (collapsedHeight || available);
  return createPortal(
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label="חיפוש נכסים" dir="rtl"
      style={{
        top,
        height,
        clipPath: shown ? 'inset(0 0 0 0)' : 'inset(0 0 100% 0)',
        transform: shown ? 'translateY(0)' : 'translateY(-16px)',
        transition: 'clip-path 520ms cubic-bezier(0.22, 1, 0.36, 1), transform 520ms cubic-bezier(0.22, 1, 0.36, 1), height 520ms cubic-bezier(0.22, 1, 0.36, 1)',
        willChange: 'clip-path, transform',
      }}
      // Below the z-50 dropdown/dialog layer so filter menus open on top of the panel.
      className="fixed inset-x-0 z-[45] flex flex-col overflow-hidden bg-background motion-reduce:!transition-none">
      <div data-search-head className="relative shrink-0 border-b border-border px-[15px] pb-3 pt-3">
        <Button type="button" variant="ghost" size="icon" aria-label="סגירת החיפוש" onClick={onClose} className="absolute end-0 top-0 h-8 w-8 rounded-none"><X className="h-5 w-5" /></Button>
        <div className="flex items-center gap-2 pe-6">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={query} onChange={e => onQueryChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }} placeholder="חיפוש נכס, עיר, רחוב…" className="h-11 ps-9 text-[16px]" />
          </div>
          <div role="group" aria-label="סוג עסקה" className="flex shrink-0 items-center gap-2">
            {(['sale', 'rent'] as const).map(value => {
              const on = dealType === 'all' || dealType === value;
              const other = value === 'sale' ? 'rent' : 'sale';
              return <label key={value} className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[15px]">
                <Checkbox className="rounded-[3px]" checked={on} onCheckedChange={() => onDealTypeChange(on ? (dealType === 'all' ? other : 'all') : 'all')} />
                {value === 'sale' ? 'למכירה' : 'להשכרה'}
              </label>;
            })}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[15px] py-3">
        <div data-search-body className="mx-auto w-full max-w-2xl">
          <button type="button" aria-expanded={advanced} onClick={() => setAdvanced(v => !v)} className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-3 text-[17px] font-semibold">
            <span>חיפוש מתקדם</span>
            <ChevronDown aria-hidden className={`h-5 w-5 transition-transform duration-200 motion-reduce:transition-none ${advanced ? 'rotate-180' : ''}`} />
          </button>
          <AnimatedExpansion open={advanced}><div className="pt-3">{filters}</div></AnimatedExpansion>
        </div>
      </div>
      <div data-search-foot className="shrink-0 border-t border-border px-[15px] pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
        <Button type="button" className="mx-auto flex h-11 w-full max-w-2xl text-[16px]" onClick={submit}>הצגת {resultCount.toLocaleString('he-IL')} נכסים</Button>
      </div>
    </div>,
    document.body,
  );
}

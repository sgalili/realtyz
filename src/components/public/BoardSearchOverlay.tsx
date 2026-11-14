import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';
import { ClearFilterButton } from '@/components/ui/clear-filter-button';

export const BOARD_SEARCH_OPEN_EVENT = 'toraff:board-search-open';
export const BOARD_SEARCH_STATE_EVENT = 'toraff:board-search-state';
export const BOARD_VIEW_TOGGLE_EVENT = 'toraff:board-view-toggle';
export const BOARD_VIEW_STATE_EVENT = 'toraff:board-view-state';

/** Inline search panel: free text on top, all filters under one "חיפוש מתקדם" row.
 *  Renders in normal flow below the header so it pushes the listings down instead
 *  of covering them; results stay visible and update live under the panel. */
export default function BoardSearchOverlay({ open, onClose, query, onQueryChange, onSearch, filters, resultCount, dealType, onDealTypeChange, activeFilters = false, onReset }: {
  dealType: string; onDealTypeChange: (v: string) => void;
  open: boolean; onClose: () => void; query: string; onQueryChange: (v: string) => void; onSearch: () => void; filters: ReactNode; resultCount: number;
  activeFilters?: boolean; onReset?: () => void;
}) {
  const [advanced, setAdvanced] = useState(false);
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
      if (!head || !body) return;
      // +4px buffer so the collapsed panel never clips the advanced row's bottom edge.
      const next = head.offsetHeight + body.offsetHeight + (foot?.offsetHeight ?? 0) + 4;
      setCollapsedHeight(prev => (Math.abs(prev - next) > 0.5 ? next : prev));
    };
    measure();
    const targets = [panelRef.current?.querySelector('[data-search-head]'), panelRef.current?.querySelector('[data-search-foot]'), panelRef.current?.querySelector('[data-search-body]')]
      .filter((el): el is Element => Boolean(el));
    const observer = new ResizeObserver(measure);
    targets.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [mounted, advanced]);
  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!mounted) return null;
  const submit = () => { if (query.trim()) onSearch(); onClose(); };
  // The panel sits in normal flow right under the header. Measure the room down
  // to the bottom of the board root (not window.innerHeight: 100dvh can be
  // smaller, and over-tall content would push the header out of view).
  const panelRect = panelRef.current?.getBoundingClientRect();
  const rootBottom = panelRef.current?.closest('header')?.parentElement?.getBoundingClientRect().bottom ?? viewportHeight;
  const available = Math.max(0, rootBottom - (panelRect?.top ?? 0));
  // Collapsed before the measurement lands, "auto" already equals the content
  // height, so the panel never paints full-screen for a frame.
  const height = advanced ? available : (collapsedHeight || 'auto');
  return (
    <div ref={panelRef} role="dialog" aria-label="חיפוש נכסים" dir="rtl"
      style={{
        height,
        clipPath: shown ? 'inset(0 0 0 0)' : 'inset(0 0 100% 0)',
        transform: shown ? 'translateY(0)' : 'translateY(-16px)',
        transition: 'clip-path 520ms cubic-bezier(0.22, 1, 0.36, 1), transform 520ms cubic-bezier(0.22, 1, 0.36, 1), height 520ms cubic-bezier(0.22, 1, 0.36, 1)',
        willChange: 'clip-path, transform',
      }}
      className="relative flex w-full flex-col overflow-hidden border-b border-border bg-background motion-reduce:!transition-none">
      <div data-search-head className="relative shrink-0 border-b border-border px-[15px] pb-3 pt-0">
        <ClearFilterButton active={!!query.trim() || activeFilters || dealType !== 'all'} onClear={() => { if (onReset) onReset(); else { onQueryChange(''); onDealTypeChange('all'); } }} />
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Input autoFocus value={query} onChange={e => onQueryChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }} placeholder="חיפוש נכס, עיר, רחוב…" className="h-11 text-[16px]" />
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
      {advanced && (
        <div data-search-foot className="shrink-0 border-t border-border px-[15px] pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
          <Button type="button" className="mx-auto flex h-11 w-full max-w-2xl text-[18px]" onClick={submit}>הצגת {resultCount.toLocaleString('he-IL')} נכסים</Button>
        </div>
      )}
    </div>
  );
}

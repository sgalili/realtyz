import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';

export const BOARD_SEARCH_OPEN_EVENT = 'toraff:board-search-open';
export const BOARD_VIEW_TOGGLE_EVENT = 'toraff:board-view-toggle';
export const BOARD_VIEW_STATE_EVENT = 'toraff:board-view-state';

/** Full-page search: free text on top, all filters under one "חיפוש מתקדם" row. */
export default function BoardSearchOverlay({ open, onClose, query, onQueryChange, onSearch, filters, resultCount }: {
  open: boolean; onClose: () => void; query: string; onQueryChange: (v: string) => void; onSearch: () => void; filters: ReactNode; resultCount: number;
}) {
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const submit = () => { if (query.trim()) onSearch(); onClose(); };
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="חיפוש נכסים" dir="rtl" className="fixed inset-0 z-[60] flex flex-col bg-background animate-in fade-in-0 motion-reduce:animate-none">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-[15px] pb-3 pt-[calc(env(safe-area-inset-top)+12px)]">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={query} onChange={e => onQueryChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }} placeholder="חיפוש נכס, עיר, רחוב…" className="h-11 ps-9 text-[16px]" />
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="סגירת החיפוש" onClick={onClose}><X className="h-5 w-5" /></Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[15px] py-3">
        <div className="mx-auto w-full max-w-2xl">
          <button type="button" aria-expanded={advanced} onClick={() => setAdvanced(v => !v)} className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-3 text-[17px] font-semibold">
            <span>חיפוש מתקדם</span>
            <ChevronDown aria-hidden className={`h-5 w-5 transition-transform duration-200 motion-reduce:transition-none ${advanced ? 'rotate-180' : ''}`} />
          </button>
          <AnimatedExpansion open={advanced}><div className="pt-3">{filters}</div></AnimatedExpansion>
        </div>
      </div>
      <div className="shrink-0 border-t border-border px-[15px] pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
        <Button type="button" className="mx-auto flex h-11 w-full max-w-2xl text-[16px]" onClick={submit}>הצגת {resultCount.toLocaleString('he-IL')} נכסים</Button>
      </div>
    </div>,
    document.body,
  );
}

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { selectFilterCity, type PropertyFilterState } from '@/lib/leadTypeFilter';
import { MissingCityAlert } from './MissingCityAlert';

/**
 * City filter used by the advanced search dialog.
 *
 * The trigger reads "בחירת ערים" until the visitor picks cities, then lists the
 * cities that actually have shared-pool properties. Its very last row is the
 * missing-city opt-in: the WhatsApp form only appears once that row is clicked.
 * The trigger and the open list are siblings so the surrounding filter grid
 * keeps its two-column layout while the list spans the full width.
 */
export function CityFilterSelect({
  cities,
  state,
  onChange,
  preferences,
}: {
  cities: string[];
  state: PropertyFilterState;
  onChange: (next: PropertyFilterState) => void;
  preferences: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setMissingOpen(false);
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // The dialog scrolls, so bring the freshly opened form into view.
  useEffect(() => {
    const form = formRef.current;
    if (!missingOpen || typeof form?.scrollIntoView !== 'function') return;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    form.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [missingOpen]);

  const selected = state.selectedCities?.length
    ? state.selectedCities
    : state.city && state.city !== 'all'
      ? [state.city]
      : [];
  const nationwide = selected.length === 0;
  const label = nationwide ? 'בחירת ערים' : selected.join(', ');

  return (
    <>
      <div ref={triggerRef} className="min-w-0 space-y-1">
        <button
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="אזור"
          onClick={() => setOpen((value) => !value)}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-[16px] shadow-sm transition-colors hover:bg-muted/50"
        >
          <span className={`truncate ${nationwide ? 'text-muted-foreground' : ''}`}>{label}</span>
          <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 opacity-50 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open ? (
        <div
          ref={listRef}
          className="col-span-2 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none"
        >
          <div role="listbox" aria-label="בחירת ערים" className="max-h-56 overflow-y-auto overscroll-contain">
            <button
              type="button"
              role="option"
              aria-selected={nationwide}
              onClick={() => onChange(selectFilterCity(state, 'all'))}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-right text-[16px] hover:bg-accent hover:text-accent-foreground"
            >
              <Check aria-hidden className={`h-4 w-4 shrink-0 ${nationwide ? 'opacity-100' : 'opacity-0'}`} />
              <span>כל הארץ</span>
            </button>
            {cities.map((city) => {
              const on = selected.includes(city);
              return (
                <button
                  key={city}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => onChange(selectFilterCity(state, city))}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-right text-[16px] hover:bg-accent hover:text-accent-foreground"
                >
                  <Check aria-hidden className={`h-4 w-4 shrink-0 ${on ? 'opacity-100' : 'opacity-0'}`} />
                  <span className="truncate">{city}</span>
                </button>
              );
            })}
            <div aria-hidden className="my-1 h-px bg-border" />
            <button
              type="button"
              aria-expanded={missingOpen}
              onClick={() => setMissingOpen((value) => !value)}
              className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-right text-[16px] hover:bg-accent hover:text-accent-foreground"
            >
              <span>העיר שלך לא מופיעה כאן?</span>
              <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 opacity-50 transition-transform duration-200 motion-reduce:transition-none ${missingOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {missingOpen ? <div ref={formRef}><MissingCityAlert preferences={preferences} /></div> : null}
        </div>
      ) : null}
    </>
  );
}

export default CityFilterSelect;

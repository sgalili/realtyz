// App-owned address autocomplete: suggestions come from our backend function,
// which calls Google Places through the connector gateway.
import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Search } from 'lucide-react';

export type ResolvedPlace = {
  formatted_address: string;
  street: string;
  house_number: string;
  neighborhood: string;
  city: string;
  area: string;
};

export default function AddressAutocomplete({ value, onPick }: { value: string; onPick: (place: ResolvedPlace) => void }) {
  const [text, setText] = useState(value);
  const [suggestions, setSuggestions] = useState<{ place_id: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(Boolean(value));
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [empty, setEmpty] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const sessionToken = useRef<string>(crypto.randomUUID());
  const latest = useRef(0);

  useEffect(() => { setText(value); setSelected(Boolean(value)); }, [value]);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => { document.removeEventListener('pointerdown', closeOutside); latest.current++; };
  }, []);

  useEffect(() => {
    const query = text.trim();
    const requestId = ++latest.current;
    setEmpty(false); setActiveIndex(-1);
    if (selected || query.length < 2) { setSuggestions([]); setLoading(false); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      let { data, error } = await supabase.functions.invoke('places-autocomplete', {
        body: { action: 'autocomplete', input: query, sessionToken: sessionToken.current },
      });
      if (error) {
        // one retry for flaky mobile networks
        ({ data, error } = await supabase.functions.invoke('places-autocomplete', {
          body: { action: 'autocomplete', input: query, sessionToken: sessionToken.current },
        }));
      }
      if (requestId !== latest.current) return;
      setLoading(false);
      if (error || (data as { error?: string } | null)?.error) {
        setSuggestions([]);
        setOpen(false);
        toast.error('חיפוש הכתובת לא זמין כרגע', { description: 'בדקו את החיבור ונסו שוב בעוד רגע.' });
        return;
      }
      const results = ((data as { suggestions?: { place_id: string; label: string }[] })?.suggestions ?? [])
        .filter((suggestion) => /[\u0590-\u05FF]/.test(suggestion.label));
      setSuggestions(results);
      setEmpty(results.length === 0);
      setOpen(true);
    }, 300);
    return () => { clearTimeout(timer); latest.current++; };
  }, [selected, text]);

  const choose = async (placeId: string, label: string) => {
    setSelected(true);
    const requestId = ++latest.current;
    setText(label); setOpen(false); setSuggestions([]);
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('places-autocomplete', {
      body: { action: 'details', place_id: placeId, sessionToken: sessionToken.current },
    });
    if (requestId !== latest.current) return;
    setLoading(false);
    sessionToken.current = crypto.randomUUID();
    const place = (data as { place?: ResolvedPlace })?.place;
    if (error || !place) {
      setSelected(false);
      toast.error('לא ניתן להשלים את פרטי הכתובת', { description: 'בחרו תוצאה אחרת או נסו שוב.' });
      return;
    }
    setSelected(true);
    onPick(place);
  };

  return (
    <div ref={root} className="relative">
      <div className="relative">
      {loading ? <Loader2 className="pointer-events-none absolute start-3 top-3 h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" /> : <Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground" />}
      <Input
        id="wizard-address"
        role="combobox"
        aria-label="חיפוש כתובת מלאה"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        value={text}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder="חיפוש כתובת מלאה"
        className="ps-9 text-base"
        onChange={(event) => { latest.current++; setLoading(false); setSelected(false); setText(event.target.value); }}
        onFocus={() => { if (suggestions.length) setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { setOpen(false); return; }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActiveIndex(current => suggestions.length ? (current + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length : -1);
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            const suggestion = open ? suggestions[activeIndex >= 0 ? activeIndex : 0] : undefined;
            if (suggestion) void choose(suggestion.place_id, suggestion.label);
          }
        }}
      />
      </div>
      {loading && <p role="status" className="mt-1 text-xs text-muted-foreground">מחפש כתובת בעברית…</p>}
      {empty && <p role="status" className="mt-1 text-xs text-muted-foreground">לא נמצאה כתובת. נסו לציין עיר ורחוב.</p>}
      {open && suggestions.length > 0 && (
        <ul id={listId} role="listbox" aria-label="כתובות בישראל" className="relative z-50 mt-1 max-h-60 w-full overflow-y-auto overscroll-contain rounded-md border bg-popover shadow-md">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.place_id} role="presentation">
              <Button
                type="button"
                variant="ghost"
                role="option"
                id={`${listId}-${index}`}
                aria-selected={index === activeIndex}
                className={`h-auto min-h-11 w-full justify-start whitespace-normal rounded-none px-3 py-3 text-start text-sm ${index === activeIndex ? 'bg-accent' : ''}`}
                onMouseDown={event => event.preventDefault()}
                onClick={() => void choose(suggestion.place_id, suggestion.label)}
              >
                {suggestion.label}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

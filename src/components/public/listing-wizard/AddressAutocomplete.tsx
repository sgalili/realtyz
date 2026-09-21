// App-owned address autocomplete: suggestions come from our backend function,
// which calls Google Places through the connector gateway.
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search } from 'lucide-react';

export type ResolvedPlace = {
  formatted_address: string;
  street: string;
  house_number: string;
  neighborhood: string;
  city: string;
  area: string;
  district: string;
};

export default function AddressAutocomplete({ value, onPick }: { value: string; onPick: (place: ResolvedPlace) => void }) {
  const [text, setText] = useState(value);
  const [suggestions, setSuggestions] = useState<{ place_id: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(Boolean(value));
  const [loading, setLoading] = useState(false);
  const sessionToken = useRef<string>(crypto.randomUUID());
  const latest = useRef(0);

  useEffect(() => { setText(value); }, [value]);

  useEffect(() => {
    const query = text.trim();
    if (selected || query.length < 2) { setSuggestions([]); return; }
    const requestId = ++latest.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('places-autocomplete', {
        body: { action: 'autocomplete', input: query, sessionToken: sessionToken.current },
      });
      if (requestId !== latest.current) return;
      setLoading(false);
      if (error || (data as { error?: string } | null)?.error) {
        setSuggestions([]);
        setOpen(false);
        toast.error('חיפוש הכתובת לא זמין כרגע', { description: 'בדקו את החיבור ונסו שוב בעוד רגע.' });
        return;
      }
      setSuggestions(((data as { suggestions?: { place_id: string; label: string }[] })?.suggestions ?? [])
        .filter((suggestion) => /[\u0590-\u05FF]/.test(suggestion.label)));
      setOpen(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [selected, text]);

  const choose = async (placeId: string, label: string) => {
    setText(label); setOpen(false); setSuggestions([]);
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('places-autocomplete', {
      body: { action: 'details', place_id: placeId, sessionToken: sessionToken.current },
    });
    setLoading(false);
    sessionToken.current = crypto.randomUUID();
    const place = (data as { place?: ResolvedPlace })?.place;
    if (error || !place) {
      toast.error('לא ניתן להשלים את פרטי הכתובת', { description: 'בחרו תוצאה אחרת או נסו שוב.' });
      return;
    }
    setSelected(true);
    onPick(place);
  };

  return (
    <div className="relative">
      <Label htmlFor="wizard-address">חיפוש כתובת</Label>
      <Search className="pointer-events-none absolute end-3 top-8 h-4 w-4 text-muted-foreground" />
      <Input
        id="wizard-address"
        value={text}
        autoComplete="off"
        placeholder="עיר, רחוב ומספר"
        className="pe-9"
        onChange={(event) => { setSelected(false); setText(event.target.value); }}
        onFocus={() => { if (suggestions.length) setOpen(true); }}
      />
      {loading && <p className="mt-1 text-xs text-muted-foreground">מחפש כתובת בעברית…</p>}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {suggestions.map((suggestion) => (
            <li key={suggestion.place_id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-right text-sm hover:bg-accent"
                onClick={() => void choose(suggestion.place_id, suggestion.label)}
              >
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

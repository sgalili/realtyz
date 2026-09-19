// App-owned address autocomplete: suggestions come from our backend function,
// which calls Google Places through the connector gateway.
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';

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
  const sessionToken = useRef<string>(crypto.randomUUID());
  const latest = useRef(0);

  useEffect(() => { setText(value); }, [value]);

  useEffect(() => {
    const query = text.trim();
    if (query.length < 2) { setSuggestions([]); return; }
    const requestId = ++latest.current;
    const timer = setTimeout(async () => {
      const { data } = await supabase.functions.invoke('places-autocomplete', {
        body: { action: 'autocomplete', input: query, sessionToken: sessionToken.current },
      });
      if (requestId !== latest.current) return;
      setSuggestions(((data as { suggestions?: { place_id: string; label: string }[] })?.suggestions ?? []));
      setOpen(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  const choose = async (placeId: string, label: string) => {
    setText(label); setOpen(false); setSuggestions([]);
    const { data } = await supabase.functions.invoke('places-autocomplete', {
      body: { action: 'details', place_id: placeId, sessionToken: sessionToken.current },
    });
    sessionToken.current = crypto.randomUUID();
    const place = (data as { place?: ResolvedPlace })?.place;
    if (place) onPick(place);
  };

  return (
    <div className="relative">
      <Label htmlFor="wizard-address">חיפוש כתובת</Label>
      <Input
        id="wizard-address"
        value={text}
        autoComplete="off"
        placeholder="עיר, רחוב ומספר"
        onChange={(event) => setText(event.target.value)}
        onFocus={() => { if (suggestions.length) setOpen(true); }}
      />
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

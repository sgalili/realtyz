import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatOfficeAddress, parseOfficeAddress, searchNationalCities, searchNationalStreets, type NationalLocality } from '@/lib/israelAddress';

function useDebouncedValue(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), 180);
    return () => window.clearTimeout(timer);
  }, [value]);
  return debounced;
}

function NationalCombobox({ label, value, placeholder, disabled, options, loading, error, menuClassName, onChange, onSelect }: {
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  options: NationalLocality[];
  loading: boolean;
  error: boolean;
  menuClassName?: string;
  onChange: (value: string) => void;
  onSelect: (option: NationalLocality) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = `national-${label.replace(/\s+/g, '-')}`;
  return <div className="min-w-0 space-y-1.5">
    <label htmlFor={id} className="text-base text-muted-foreground">{label}</label>
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="w-full">
          <Input
            id={id}
            dir="rtl"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            autoComplete="off"
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            onChange={event => { onChange(event.target.value); setOpen(true); }}
            className="h-10 text-right text-base font-bold placeholder:font-normal"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent dir="rtl" align="start" collisionPadding={16} onOpenAutoFocus={event => event.preventDefault()} className={`max-h-72 overflow-y-auto p-1 ${menuClassName ?? 'w-[--radix-popover-trigger-width]'}`}>
        {loading && <div role="status" className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />טוען תוצאות…</div>}
        {!loading && error && <p role="alert" className="px-3 py-4 text-center text-sm text-destructive">שירות הכתובות אינו זמין כרגע</p>}
        {!loading && !error && options.length === 0 && <p className="px-3 py-4 text-center text-sm text-muted-foreground">לא נמצאו תוצאות</p>}
        {!loading && !error && options.map(option => <Button
          key={`${option.code}:${option.name}`}
          type="button"
          variant="ghost"
          className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-right text-base"
          onMouseDown={event => event.preventDefault()}
          onClick={() => { onSelect(option); setOpen(false); }}
        >{option.name}</Button>)}
      </PopoverContent>
    </Popover>
  </div>;
}

export function AgencyAddressFields({ city, address, disabled, onSave }: {
  city: string;
  address: string;
  disabled: boolean;
  onSave: (city: string, address: string) => Promise<boolean>;
}) {
  const [cityDraft, setCityDraft] = useState(city);
  const [streetDraft, setStreetDraft] = useState(() => parseOfficeAddress(address).street);
  const [houseDraft, setHouseDraft] = useState(() => parseOfficeAddress(address).houseNumber);
  const [selectedCityCode, setSelectedCityCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setCityDraft(city);
    const parsed = parseOfficeAddress(address);
    setStreetDraft(parsed.street);
    setHouseDraft(parsed.houseNumber);
    setSelectedCityCode(null);
  }, [city, address]);

  const citySearch = useDebouncedValue(cityDraft);
  const streetSearch = useDebouncedValue(streetDraft);
  const cities = useQuery({
    queryKey: ['national-cities', citySearch],
    queryFn: ({ signal }) => searchNationalCities(citySearch, signal),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const resolvedCity = useQuery({
    queryKey: ['national-city-resolve', city],
    queryFn: async ({ signal }) => {
      const matches = await searchNationalCities(city, signal);
      return matches.find(match => match.name === city.trim())?.code ?? null;
    },
    enabled: !!city.trim() && !selectedCityCode,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const cityCode = cityDraft.trim() === city.trim() ? selectedCityCode ?? resolvedCity.data ?? null : null;
  const streets = useQuery({
    queryKey: ['national-streets', cityCode, streetSearch],
    queryFn: ({ signal }) => searchNationalStreets(cityCode!, streetSearch, signal),
    enabled: !!cityCode,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const save = async (nextCity: string, nextAddress: string) => {
    if (saving || disabled) return;
    setSaving(true);
    const saved = await onSave(nextCity, nextAddress);
    if (!saved) {
      setCityDraft(city);
      const parsed = parseOfficeAddress(address);
      setStreetDraft(parsed.street);
      setHouseDraft(parsed.houseNumber);
    }
    setSaving(false);
  };
  const busy = disabled || saving;

  return <fieldset className="min-w-0 space-y-3" disabled={busy}>
    <legend className="mb-1 text-base font-semibold">כתובת המשרד</legend>
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_96px] gap-2">
      <NationalCombobox
        label="עיר / יישוב"
        value={cityDraft}
        placeholder="עיר"
        disabled={busy}
        options={cities.data ?? []}
        loading={cities.isFetching}
        error={cities.isError}
        menuClassName="w-[min(36rem,calc(100vw-2rem))]"
        onChange={value => { setCityDraft(value); setSelectedCityCode(null); }}
        onSelect={option => {
          setSelectedCityCode(option.code);
          setCityDraft(option.name);
          setStreetDraft('');
          setHouseDraft('');
          void save(option.name, '');
        }}
      />
      <NationalCombobox
        label="רחוב"
        value={streetDraft}
        placeholder={cityCode ? 'חיפוש רחוב' : 'קודם בחרו עיר מהרשימה'}
        disabled={busy || !cityCode}
        options={streets.data ?? []}
        loading={streets.isFetching}
        error={streets.isError || resolvedCity.isError}
        onChange={setStreetDraft}
        onSelect={option => {
          setStreetDraft(option.name);
          void save(city, formatOfficeAddress(option.name, houseDraft));
        }}
      />
      <div className="space-y-1.5">
        <label htmlFor="office-house-number" className="text-base text-muted-foreground">מספר בית</label>
        <div className="relative">
          <Input
            id="office-house-number"
            dir="ltr"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={5}
            autoComplete="off"
            value={houseDraft}
            disabled={busy}
            onChange={event => setHouseDraft(event.target.value.replace(/\D/g, '').slice(0, 5))}
            onBlur={() => { if (formatOfficeAddress(streetDraft, houseDraft) !== address.trim()) void save(city, formatOfficeAddress(streetDraft, houseDraft)); }}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void save(city, formatOfficeAddress(streetDraft, houseDraft)); } }}
            className="h-10 pe-2 ps-10 text-left text-base font-bold"
          />
          <Button type="button" variant="ghost" size="icon" className="absolute inset-y-0 left-0 h-10 w-10" aria-label="שמירת מספר הבית" disabled={busy || !streetDraft.trim()} onClick={() => void save(city, formatOfficeAddress(streetDraft, houseDraft))}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  </fieldset>;
}

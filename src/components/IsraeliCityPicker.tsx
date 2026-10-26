import { useId, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, MapPin } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectBox } from '@/components/ui/multi-select-controls';
import { cn } from '@/lib/utils';
import { ISRAELI_CITIES } from '@/data/israeliCities';

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  itemClassName?: string;
  selectedValues?: string[];
  onSelectionChange?: (values: string[]) => void;
  firstOptions?: string[];
};

export function IsraeliCityPicker({ value, onChange, placeholder = 'בחר עיר', className, itemClassName, selectedValues, onSelectionChange, firstOptions = [] }: Props) {
  const otherId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [otherText, setOtherText] = useState('');
  const [editingOther, setEditingOther] = useState(false);

  const isPresetCity = useMemo(() => ISRAELI_CITIES.includes(value), [value]);
  const showsOther = !!value && !isPresetCity;

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return ISRAELI_CITIES;
    return ISRAELI_CITIES.filter((c) => c.includes(q));
  }, [search]);

  const selectCity = (city: string) => {
    if (selectedValues && onSelectionChange) {
      onSelectionChange(selectedValues.includes(city) ? selectedValues.filter(item => item !== city) : [...selectedValues, city]);
      return;
    }
    onChange(city);
    setOpen(false);
    setSearch('');
  };

  const applyOther = () => {
    const v = otherText.trim();
    if (!v) return;
    if (selectedValues && onSelectionChange) onSelectionChange([...new Set([...selectedValues, v])]);
    else onChange(v);
    setOtherText('');
    setEditingOther(false);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setEditingOther(false); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={placeholder}
          aria-expanded={open}
          dir="rtl"
          className={cn('h-9 w-full justify-between text-right text-sm font-semibold', className)}
        >
          <span className={cn('flex-1 truncate', !value && 'text-muted-foreground font-normal')}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" collisionPadding={12} className="flex max-h-[var(--radix-popover-content-available-height)] w-[--radix-popover-trigger-width] flex-col overflow-hidden p-0" align="end">
        {!editingOther && <>
        <div className="border-b p-2">
          <Input
            dir="rtl"
            autoFocus
            placeholder="חיפוש עיר..."
            aria-label="חיפוש עיר"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn('h-9 text-right text-sm font-bold placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0', itemClassName)}
          />
        </div>
        <div className="min-h-0 max-h-64 overflow-y-auto overscroll-contain">
          <div className="p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                לא נמצאו ערים. הזן בעצמך למטה.
              </div>
            ) : (
              [...firstOptions.filter(option => !search || option.includes(search)), ...filtered].map((city) => (
                <div key={city} className="flex items-center px-2">
                  {selectedValues && <SelectBox checked={selectedValues.includes(city)} onChange={() => selectCity(city)} label={city} />}
                <Button
                  key={city}
                  type="button"
                  variant="ghost"
                  onClick={() => selectCity(city)}
                  className={cn('flex h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 text-right text-sm font-normal', itemClassName)}
                >
                  <Check className={cn('h-3.5 w-3.5', value === city ? 'opacity-100 text-primary' : 'opacity-0')} />
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <span className="flex-1">{city}</span>
                </Button>
                </div>
              ))
            )}
            <Button type="button" variant="ghost" className={cn('h-auto w-full justify-start px-3 py-2 text-sm font-normal', itemClassName)} onClick={() => { setOtherText(showsOther ? value : ''); setEditingOther(true); }}>אחר (טקסט חופשי)</Button>
          </div>
        </div>
        </>}
        {editingOther && <div className="space-y-2 p-3 bg-muted/30">
          <Label htmlFor={otherId} className={cn('text-sm text-muted-foreground', itemClassName)}>אחר (טקסט חופשי)</Label>
          <div className="flex gap-1.5">
            <Input
              dir="rtl"
              id={otherId}
              autoFocus
              aria-label="עיר או אזור אחר"
              placeholder={showsOther ? value : 'הזן עיר / אזור...'}
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyOther();
                }
              }}
              className={cn('h-10 min-w-0 text-right text-sm font-bold placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0', itemClassName)}
            />
            <Button type="button" size="sm" className="h-10 shrink-0" onClick={applyOther} disabled={!otherText.trim()}>
              הוסף
            </Button>
          </div>
          <Button type="button" variant="ghost" onClick={() => setEditingOther(false)}>חזרה לרשימה</Button>
        </div>}
      </PopoverContent>
    </Popover>
  );
}

export default IsraeliCityPicker;

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, MapPin } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ISRAELI_CITIES } from '@/data/israeliCities';

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
};

export function IsraeliCityPicker({ value, onChange, placeholder = 'בחר עיר', className }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [otherText, setOtherText] = useState('');

  const isPresetCity = useMemo(() => ISRAELI_CITIES.includes(value), [value]);
  const showsOther = !!value && !isPresetCity;

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return ISRAELI_CITIES;
    return ISRAELI_CITIES.filter((c) => c.includes(q));
  }, [search]);

  const selectCity = (city: string) => {
    onChange(city);
    setOpen(false);
    setSearch('');
  };

  const applyOther = () => {
    const v = otherText.trim();
    if (!v) return;
    onChange(v);
    setOtherText('');
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          dir="rtl"
          className={cn('h-9 w-full justify-between text-right text-sm font-semibold', className)}
        >
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          <span className={cn('flex-1 truncate', !value && 'text-muted-foreground font-normal')}>
            {value || placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" className="w-[--radix-popover-trigger-width] p-0" align="end">
        <div className="border-b p-2">
          <Input
            dir="rtl"
            autoFocus
            placeholder="חיפוש עיר..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-right text-sm"
          />
        </div>
        <ScrollArea className="h-64">
          <div className="p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                לא נמצאו ערים. הזן בעצמך למטה.
              </div>
            ) : (
              filtered.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => selectCity(city)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-right text-sm hover:bg-accent"
                >
                  <Check className={cn('h-3.5 w-3.5', value === city ? 'opacity-100 text-primary' : 'opacity-0')} />
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <span className="flex-1">{city}</span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
        <div className="border-t p-2 space-y-1.5 bg-muted/30">
          <Label className="text-[11px] text-muted-foreground">אחר (טקסט חופשי)</Label>
          <div className="flex gap-1.5">
            <Input
              dir="rtl"
              placeholder={showsOther ? value : 'הזן עיר / אזור...'}
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyOther();
                }
              }}
              className="h-8 text-right text-sm"
            />
            <Button type="button" size="sm" className="h-8 shrink-0" onClick={applyOther} disabled={!otherText.trim()}>
              הוסף
            </Button>
          </div>
          {showsOther && (
            <p className="text-[11px] text-muted-foreground">נבחר טקסט חופשי: <span className="font-semibold text-foreground">{value}</span></p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default IsraeliCityPicker;

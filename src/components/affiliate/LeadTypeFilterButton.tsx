// Filter button that lives inside a search field, on the side opposite the
// magnifier. Filters by lead type, lead value, and every property detail
// (deal type, kind, city, neighborhood, rooms, price, size, floor).
import { ClipboardList, Phone, SlidersHorizontal, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { WhatsAppIcon } from '@/components/properties/WhatsAppIcon';
import {
  EMPTY_LEAD_FILTER,
  EMPTY_PROPERTY_FILTER,
  LEAD_TYPE_LABELS,
  LEAD_TYPE_ORDER,
  leadFilterActiveCount,
  propertyFilterActiveCount,
  type LeadFilterState,
  type LeadTypeKey,
  type PropertyFilterState,
} from '@/lib/leadTypeFilter';

const ICONS: Record<LeadTypeKey, typeof ClipboardList> = {
  tier1: ClipboardList,
  tier2: WhatsAppIcon as typeof ClipboardList,
  tier3: Phone,
  tier4: Trophy,
};

/** Two numeric bounds on one row. */
function RangeRow({
  label,
  suffix,
  min,
  max,
  onChange,
  step = 1,
}: {
  label: string;
  suffix?: string;
  min: number | null;
  max: number | null;
  onChange: (next: { min: number | null; max: number | null }) => void;
  step?: number;
}) {
  const parse = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw));
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}{suffix ? ` (${suffix})` : ''}</Label>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          step={step}
          dir="ltr"
          placeholder="מ־"
          className="h-9"
          value={min ?? ''}
          onChange={(event) => onChange({ min: parse(event.target.value), max })}
        />
        <Input
          type="number"
          step={step}
          dir="ltr"
          placeholder="עד"
          className="h-9"
          value={max ?? ''}
          onChange={(event) => onChange({ min, max: parse(event.target.value) })}
        />
      </div>
    </div>
  );
}

export default function LeadTypeFilterButton({
  state,
  onChange,
  propertyState,
  onPropertyChange,
  cities = [],
  neighborhoods = [],
  propertyTypes = [],
  className = '',
}: {
  state: LeadFilterState;
  onChange: (next: LeadFilterState) => void;
  /** Omit to show only the lead filters. */
  propertyState?: PropertyFilterState;
  onPropertyChange?: (next: PropertyFilterState) => void;
  cities?: string[];
  neighborhoods?: string[];
  propertyTypes?: string[];
  className?: string;
}) {
  const property = propertyState ?? null;
  const active = leadFilterActiveCount(state) + (property ? propertyFilterActiveCount(property) : 0);

  const toggle = (key: LeadTypeKey) => {
    const types = state.types.includes(key)
      ? state.types.filter((value) => value !== key)
      : [...state.types, key];
    onChange({ ...state, types });
  };

  const setBound = (field: 'min' | 'max', raw: string) => {
    const trimmed = raw.trim();
    onChange({ ...state, [field]: trimmed === '' ? null : Math.max(0, Number(trimmed) || 0) });
  };

  const patch = (next: Partial<PropertyFilterState>) => {
    if (property && onPropertyChange) onPropertyChange({ ...property, ...next });
  };

  const reset = () => {
    onChange(EMPTY_LEAD_FILTER);
    if (onPropertyChange) onPropertyChange(EMPTY_PROPERTY_FILTER);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="סינון נכסים, סוג ליד ושווי ליד"
          title="סינון נכסים, סוג ליד ושווי ליד"
          className={`relative grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${active ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground' : ''} ${className}`}
        >
          <SlidersHorizontal className="h-4 w-4" />

        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[70vh] w-80 space-y-3 overflow-y-auto p-3" dir="rtl">
        <div className="text-sm font-semibold">סוג הליד</div>
        <div className="space-y-2">
          {LEAD_TYPE_ORDER.map((key) => {
            const Icon = ICONS[key];
            return (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
                <Checkbox checked={state.types.includes(key)} onCheckedChange={() => toggle(key)} />
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                {LEAD_TYPE_LABELS[key]}
              </label>
            );
          })}
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">שווי הליד (₪)</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" min={0} dir="ltr" placeholder="מ־" className="h-9" value={state.min ?? ''} onChange={(event) => setBound('min', event.target.value)} />
            <Input type="number" min={0} dir="ltr" placeholder="עד" className="h-9" value={state.max ?? ''} onChange={(event) => setBound('max', event.target.value)} />
          </div>
        </div>

        {property ? (
          <>
            <Separator />
            <div className="text-sm font-semibold">פרטי הנכס</div>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">סוג עסקה</Label>
                <Select value={property.dealType} onValueChange={(value) => patch({ dealType: value as PropertyFilterState['dealType'] })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    <SelectItem value="sale">למכירה</SelectItem>
                    <SelectItem value="rent">להשכרה</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {propertyTypes.length ? (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">סוג נכס</Label>
                  <Select value={property.propertyType} onValueChange={(value) => patch({ propertyType: value })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">כל הסוגים</SelectItem>
                      {propertyTypes.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {cities.length ? (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">עיר</Label>
                  <Select value={property.city} onValueChange={(value) => patch({ city: value, neighborhood: 'all' })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">כל הערים</SelectItem>
                      {cities.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {neighborhoods.length ? (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">שכונה</Label>
                  <Select value={property.neighborhood} onValueChange={(value) => patch({ neighborhood: value })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">כל השכונות</SelectItem>
                      {neighborhoods.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <RangeRow label="מחיר" suffix="₪" min={property.priceMin} max={property.priceMax} step={1000} onChange={({ min, max }) => patch({ priceMin: min, priceMax: max })} />
              <RangeRow label="חדרים" min={property.roomsMin} max={property.roomsMax} step={0.5} onChange={({ min, max }) => patch({ roomsMin: min, roomsMax: max })} />
              <RangeRow label="שטח" suffix='מ"ר' min={property.sizeMin} max={property.sizeMax} step={5} onChange={({ min, max }) => patch({ sizeMin: min, sizeMax: max })} />
              <RangeRow label="קומה" min={property.floorMin} max={property.floorMax} onChange={({ min, max }) => patch({ floorMin: min, floorMax: max })} />
            </div>
          </>
        ) : null}

        <div className="flex justify-start">
          <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={!active}>
            ניקוי סינון
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

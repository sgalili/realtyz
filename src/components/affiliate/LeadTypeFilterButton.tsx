// Role-aware advanced filter that lives inside a search field, on the side
// opposite the magnifier.
//
// The visible sections adapt to the signed-in user type so every role sees
// only the filters that matter to them:
//   · שותף / partner  — lead types, lead value, deal type, city, neighborhood,
//                        price range (lead-first priority, minimal set).
//   · מתווך / broker   — lead types (incl. deal closing) + full property set.
//   · יזם / קבלן       — market/property filters only.
//   · קונה/מוכר פרטי   — compact market filters only.
//   · guest            — property filters only, never lead filters.
import { ClipboardList, Phone, Filter, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { WhatsAppIcon } from '@/components/properties/WhatsAppIcon';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
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

/** Compact section heading for visual hierarchy inside the popover. */
function SectionTitle({ children }: { children: string }) {
  return <div className="text-[13px] font-semibold leading-none">{children}</div>;
}

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

/** Which property fields each role needs, in display order. */
type PropertyField = 'dealType' | 'propertyType' | 'city' | 'neighborhood' | 'price' | 'rooms' | 'size' | 'floor';

const PARTNER_FIELDS: PropertyField[] = ['dealType', 'city', 'neighborhood', 'price'];
const PRIVATE_FIELDS: PropertyField[] = ['dealType', 'city', 'neighborhood', 'price', 'rooms'];
const MARKET_FIELDS: PropertyField[] = ['dealType', 'propertyType', 'city', 'neighborhood', 'price', 'rooms', 'size', 'floor'];

export default function LeadTypeFilterButton({
  state,
  onChange,
  propertyState,
  onPropertyChange,
  cities = [],
  neighborhoods = [],
  propertyTypes = [],
  hideLeadFilters = false,
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
  hideLeadFilters?: boolean;
  className?: string;
}) {
  const { user } = useAuth();
  const { isAffiliate, isTeamMember, isDeveloper, isPropertyOwner, isPropertySeeker } = useUserRole();

  // Resolve the active user kind. Brokers win over the affiliate flag because a
  // broker+partner account can close deals and needs the full toolset.
  const kind: 'broker' | 'partner' | 'developer' | 'private' | 'guest' = !user
    ? 'guest'
    : isTeamMember
      ? 'broker'
      : isAffiliate
        ? 'partner'
        : isDeveloper
          ? 'developer'
          : isPropertyOwner || isPropertySeeker
            ? 'private'
            : 'guest';

  // Lead filters: partners and brokers only. Deal-closing (tier4) is visible
  // to registered brokers; partners see the first three tiers only.
  const showLeadFilters = !hideLeadFilters && (kind === 'partner' || kind === 'broker');
  const leadTypes = kind === 'broker' ? LEAD_TYPE_ORDER : LEAD_TYPE_ORDER.filter((key) => key !== 'tier4');

  // Property/market fields per role — minimal for partners and private users.
  const fields: PropertyField[] = kind === 'partner'
    ? PARTNER_FIELDS
    : kind === 'private'
      ? PRIVATE_FIELDS
      : MARKET_FIELDS;

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

  const show = (field: PropertyField) => !!property && fields.includes(field);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="סינון מתקדם"
          title="סינון מתקדם"
          className={`relative grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${active ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground' : ''} ${className}`}
        >
          <Filter className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[70vh] w-80 space-y-3 overflow-y-auto p-3" dir="rtl">
        {showLeadFilters ? (<>
          <SectionTitle>סוג הליד</SectionTitle>
          <div className="space-y-1.5">
            {leadTypes.map((key) => {
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
        </>) : null}

        {property ? (
          <>
            {showLeadFilters ? <Separator /> : null}
            <SectionTitle>פרטי הנכס</SectionTitle>
            <div className="space-y-2">
              {show('dealType') ? (
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
              ) : null}
              {show('propertyType') && propertyTypes.length ? (
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
              {show('city') && cities.length ? (
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
              {show('neighborhood') && neighborhoods.length ? (
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
              {show('price') ? <RangeRow label="מחיר" suffix="₪" min={property.priceMin} max={property.priceMax} step={1000} onChange={({ min, max }) => patch({ priceMin: min, priceMax: max })} /> : null}
              {show('rooms') ? <RangeRow label="חדרים" min={property.roomsMin} max={property.roomsMax} step={0.5} onChange={({ min, max }) => patch({ roomsMin: min, roomsMax: max })} /> : null}
              {show('size') ? <RangeRow label="שטח" suffix='מ"ר' min={property.sizeMin} max={property.sizeMax} step={5} onChange={({ min, max }) => patch({ sizeMin: min, sizeMax: max })} /> : null}
              {show('floor') ? <RangeRow label="קומה" min={property.floorMin} max={property.floorMax} onChange={({ min, max }) => patch({ floorMin: min, floorMax: max })} /> : null}
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

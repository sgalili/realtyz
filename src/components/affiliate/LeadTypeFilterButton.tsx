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
import { useEffect, useState } from 'react';
import { ChevronDown, ClipboardList, Phone, Filter, Trophy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { closingLevelClass, LEAD_PRICE_RANGES } from '@/lib/leadPriceRanges';
import { partnerPotential } from '@/lib/partnerPotential';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { LeadPriceSlider } from '@/components/public/LeadPriceSlider';
import { PropertyAmenitiesFields } from '@/components/public/PropertyAmenitiesFields';
import { EMPTY_PUBLIC_LISTING_DRAFT, type PublicListingDraftFields } from '@/lib/publicListingDraft';
import { PROPERTY_TYPE_OPTIONS, PROPERTY_CONDITION_OPTIONS, PROPERTY_FLOOR_OPTIONS } from '@/lib/propertyFormOptions';
import { WhatsAppIcon } from '@/components/properties/WhatsAppIcon';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePropertyPageAccess } from '@/hooks/usePropertyPageAccess';
import { useUserRole } from '@/hooks/useUserRole';
import {
  EMPTY_LEAD_FILTER,
  EMPTY_PROPERTY_FILTER,
  LEAD_TYPE_ORDER,
  leadFilterActiveCount,
  propertyFilterActiveCount,
  selectFilterCity,
  setLeadFilterMinimum,
  leadFilterSliderRange,
  FILTER_FEATURES,
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

// Option names mirror the "add new ad" step-8 reward labels.
const FILTER_LEAD_LABELS: Record<LeadTypeKey, string> = {
  tier1: 'פנייה דרך טופס בעמוד נחיתה',
  tier2: 'פנייה לאחר סינון בווטסאפ עם ריטה AI',
  tier3: 'פנייה לאחר סינון בטלפון עם ריטה AI',
  tier4: 'עמלת תיווך עבור סגירת עסקה',
};

/** Compact section heading for visual hierarchy inside the popover. */
function SectionTitle({ children }: { children: string }) {
  return <div className="text-[15px] font-semibold leading-none">{children}</div>;
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
      
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          step={step}
          dir={min == null ? 'rtl' : 'ltr'}
          aria-label={`${label} מינימום`} placeholder={`${label}${suffix ? ` (${suffix})` : ''} מ־`}
          className="h-9 text-[16px]"
          value={min ?? ''}
          onChange={(event) => onChange({ min: parse(event.target.value), max })}
        />
        <Input
          type="number"
          step={step}
          dir={max == null ? 'rtl' : 'ltr'}
          aria-label={`${label} מקסימום`} placeholder={`${label}${suffix ? ` (${suffix})` : ''} עד`}
          className="h-9 text-[16px]"
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
  inline = false,
  open: controlledOpen,
  onOpenChange,
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
  inline?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const [expandedType, setExpandedType] = useState<LeadTypeKey | null>(null);
  const [entryDateMode, setEntryDateMode] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (next: boolean) => { setLocalOpen(next); onOpenChange?.(next); };
  const { user } = useAuth();
  const { isAffiliate, isTeamMember, isDeveloper, isPropertyOwner, isPropertySeeker } = useUserRole();

  const verifiedBroker = usePropertyPageAccess().properties;
  const bounds = useQuery({
    queryKey: ['public-lead-price-bounds', user?.id, verifiedBroker],
    enabled: !!user && open,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_public_lead_price_bounds');
      if (error) throw error;
      return data as Record<string, { min: number | null; max: number | null }>;
    },
  });
  // Resolve the active user kind. Brokers win over the affiliate flag because a
  // broker+partner account can close deals and needs the full toolset.
  const kind: 'broker' | 'partner' | 'developer' | 'private' | 'guest' = !user
    ? 'guest'
    : isTeamMember && verifiedBroker
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
  const showLeadFilters = !hideLeadFilters && (kind === 'partner' || kind === 'broker' || isTeamMember);
  const leadTypes = kind === 'broker' ? LEAD_TYPE_ORDER : LEAD_TYPE_ORDER.filter((key) => key !== 'tier4');

  // Property/market fields per role — minimal for partners and private users.
  const fields: PropertyField[] = kind === 'partner'
    ? PARTNER_FIELDS
    : kind === 'private'
      ? PRIVATE_FIELDS
      : MARKET_FIELDS;

  const property = propertyState ?? null;
  const active = leadFilterActiveCount(state) + (property ? propertyFilterActiveCount(property) : 0);

  const BOUND_KEY = { tier1: 'form', tier2: 'whatsapp', tier3: 'phone', tier4: 'closing' } as const;
  useEffect(() => {
    if (!open) setExpandedType(null);
  }, [open]);

  const patch = (next: Partial<PropertyFilterState>) => {
    if (property && onPropertyChange) onPropertyChange({ ...property, ...next });
  };

  const reset = () => {
    setExpandedType(null);
    onChange(EMPTY_LEAD_FILTER);
    if (onPropertyChange) onPropertyChange(EMPTY_PROPERTY_FILTER);
  };

  const show = (field: PropertyField) => !!property && fields.includes(field);
  const amenities = property?.amenities ?? {};
  const amenityFields: PublicListingDraftFields = { ...EMPTY_PUBLIC_LISTING_DRAFT, ...amenities };
  const patchAmenities = (next: Partial<PublicListingDraftFields>) => patch({ amenities: { ...amenities, ...Object.fromEntries(Object.entries(next).filter(([key]) => ['rooms', 'elevatorCount', 'parkingCount', 'balconyTypes', 'viewType', 'airDirections', 'condition', 'entryDate', 'totalFloors'].includes(key))) } });

  const trigger = (
    <Button type="button" variant="ghost" size="icon" aria-label="סינון מתקדם" title="סינון מתקדם" aria-expanded={open}
      onClick={inline ? () => setOpen(!open) : undefined}
      className={`relative h-7 w-7 shrink-0 text-muted-foreground ${open ? 'bg-primary text-primary-foreground' : ''} ${className}`}>
      <Filter className="h-4 w-4" />
    </Button>
  );
  const content = (
    <>
      <div className="flex items-center justify-start gap-1">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="סגירת סינון" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
        <h2 className="text-[17px] font-semibold leading-none">חיפוש מתקדם</h2>
        {active ? <Button type="button" size="sm" variant="ghost" className="ms-auto h-7 px-2 text-[12px]" onClick={reset}>ניקוי סינון</Button> : null}
      </div>
        {showLeadFilters ? (<>
          <SectionTitle>תגמולים לפי סוג פנייה</SectionTitle>
          <div className="space-y-1.5" dir="rtl">
            {leadTypes.map((key) => {
              const Icon = ICONS[key];
              const amount = state.prices?.[key] ?? (state.types[0] === key ? state.min ?? 0 : 0);
              const tier = key === 'tier1' ? 'form' : key === 'tier2' ? 'whatsapp' : 'phone';
              const bound = bounds.data?.[BOUND_KEY[key]];
              const range = leadFilterSliderRange(key, bound) ?? LEAD_PRICE_RANGES[tier];
              const color = amount > 0 ? closingLevelClass(partnerPotential((amount - range.min) / Math.max(1, range.max - range.min)).level) : 'text-muted-foreground';
              return (
                <div key={key}>
                <Button type="button" variant="ghost" aria-label={FILTER_LEAD_LABELS[key]} aria-expanded={expandedType === key} onClick={() => setExpandedType(expandedType === key ? null : key)} className="h-auto w-full items-start justify-start gap-2 whitespace-nowrap px-0 py-1 text-right text-[14px] font-medium">
                  <Icon key="icon" className={`mt-1 h-3.5 w-3.5 shrink-0 ${color}`} />
                  <span key="title" className="min-w-0 flex-1"><span>{FILTER_LEAD_LABELS[key]}</span>{amount > 0 && <span className={`block text-right text-[14px] font-semibold ${color}`}>לפחות: <bdi>₪{amount.toLocaleString('he-IL')}</bdi></span>}</span>
                  <ChevronDown key="chevron" aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none ${expandedType === key ? 'rotate-180' : ''}`} />
                </Button>
                {expandedType === key && <div className="py-2 animate-in fade-in-0 motion-reduce:animate-none"><LeadPriceSlider hidePotential range={range} tier={tier} label={FILTER_LEAD_LABELS[key]} value={String(amount)} onChange={value => onChange(setLeadFilterMinimum(state, key, Number(value)))} /></div>}
                </div>
              );
            })}
          </div>
        </>) : null}

        {property ? (
          <>
            {showLeadFilters ? <Separator /> : null}
            <SectionTitle>פרטי הנכס</SectionTitle>
            <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
              {show('dealType') ? (
                <div className="space-y-1">
                  <Select value={property.dealType} onValueChange={(value) => patch({ dealType: value as PropertyFilterState['dealType'] })}>
                    <SelectTrigger aria-label="סוג עסקה" className="h-9 text-[16px]"><SelectValue placeholder="סוג עסקה" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">סוג עסקה</SelectItem>
                      <SelectItem value="sale">למכירה</SelectItem>
                      <SelectItem value="rent">להשכרה</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {show('propertyType') ? (
                <div className="space-y-1">
                  <Select value={property.propertyType} onValueChange={(value) => patch({ propertyType: value })}>
                    <SelectTrigger aria-label="סוג נכס" className="h-9 text-[16px]"><SelectValue placeholder="סוג נכס" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">סוג נכס</SelectItem>
                      {Array.from(new Set([...PROPERTY_TYPE_OPTIONS, ...propertyTypes])).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {show('city') && cities.length ? (
                <div className="space-y-1">
                  <Select value="" onValueChange={(value) => patch(selectFilterCity(property, value))}>
                    <SelectTrigger aria-label="אזור" className="h-9 text-[16px]"><span className="truncate">{property.city === 'all' ? 'כל הארץ' : property.selectedCities?.length ? property.selectedCities.join(', ') : property.city || 'אזור'}</span></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">כל הארץ</SelectItem>
                      {property.city === 'all' ? <SelectItem value="choose">בחירת ערים</SelectItem> : cities.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {show('neighborhood') && neighborhoods.length ? (
                <div className="space-y-1">
                  <Select value={property.neighborhood} onValueChange={(value) => patch({ neighborhood: value })}>
                    <SelectTrigger aria-label="שכונה" className="h-9 text-[16px]"><SelectValue placeholder="שכונה" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">שכונה</SelectItem>
                      {neighborhoods.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {show('price') ? <div className="col-span-2"><RangeRow label="מחיר" suffix="₪" min={property.priceMin} max={property.priceMax} step={1000} onChange={({ min, max }) => patch({ priceMin: min, priceMax: max })} /></div> : null}
              {show('size') ? <div className="col-span-2"><RangeRow label="שטח" suffix='מ"ר' min={property.sizeMin} max={property.sizeMax} step={5} onChange={({ min, max }) => patch({ sizeMin: min, sizeMax: max })} /></div> : null}
              {show('floor') ? <><Select value={property.floorMin == null ? 'all' : String(property.floorMin)} onValueChange={value => patch({ floorMin: value === 'all' ? null : Number(value), floorMax: value === 'all' || value === '10' ? null : Number(value) })}><SelectTrigger aria-label="קומה" className="h-10 text-[16px]"><SelectValue placeholder="קומה" /></SelectTrigger><SelectContent><SelectItem value="all">קומה</SelectItem>{PROPERTY_FLOOR_OPTIONS.map(value => <SelectItem key={value} value={value === 'קרקע' ? '0' : value.replace('+', '')}>{value === 'קרקע' ? value : `קומה ${value}`}</SelectItem>)}</SelectContent></Select><Select value={amenities.totalFloors || 'all'} onValueChange={value => patchAmenities({ totalFloors: value === 'all' ? '' : value })}><SelectTrigger aria-label="כמה קומות יש בבניין?" className="h-10 text-[16px]"><SelectValue placeholder="כמה קומות יש בבניין?" /></SelectTrigger><SelectContent><SelectItem value="all">כמה קומות יש בבניין?</SelectItem>{PROPERTY_FLOOR_OPTIONS.map(value => <SelectItem key={value} value={value}>{value === 'קרקע' ? value : `${value} קומות`}</SelectItem>)}</SelectContent></Select></> : null}
            </div>
            <PropertyAmenitiesFields fields={amenityFields} onChange={patchAmenities} filterMode hideRooms={!show('rooms')} />
            <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
              <div className="space-y-2"><Select value={amenities.entryDate === 'מיידית' ? 'immediate' : entryDateMode || amenities.entryDate ? 'date' : 'all'} onValueChange={value => { setEntryDateMode(value === 'date'); patchAmenities({ entryDate: value === 'immediate' ? 'מיידית' : '' }); }}><SelectTrigger aria-label="תאריך כניסה" className="h-10 text-[16px]"><SelectValue placeholder="תאריך כניסה" /></SelectTrigger><SelectContent><SelectItem value="all">תאריך כניסה</SelectItem><SelectItem value="immediate">מיידית</SelectItem><SelectItem value="date">בחירת תאריך</SelectItem></SelectContent></Select>{entryDateMode && <Input type="date" aria-label="תאריך כניסה נבחר" value={amenities.entryDate === 'מיידית' ? '' : amenities.entryDate ?? ''} onChange={event => patchAmenities({ entryDate: event.target.value })} />}</div>
              <Select value={amenities.condition || 'all'} onValueChange={value => patchAmenities({ condition: value === 'all' ? '' : value })}><SelectTrigger aria-label="מצב הנכס" className="h-10 text-[16px]"><SelectValue placeholder="מצב הנכס" /></SelectTrigger><SelectContent><SelectItem value="all">מצב הנכס</SelectItem>{PROPERTY_CONDITION_OPTIONS.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
            </div>
            <SectionTitle>מאפיינים</SectionTitle>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
              {FILTER_FEATURES.filter(feature => !['elevator', 'parking', 'balcony', 'open_view', 'renovated'].includes(feature.key)).map(feature => {
                const checked = property.features?.includes(feature.key) ?? false;
                return <label key={feature.key} className="flex cursor-pointer items-center gap-2 text-[15px]">
                  <Checkbox checked={checked} onCheckedChange={() => patch({ features: checked ? (property.features ?? []).filter(k => k !== feature.key) : [...(property.features ?? []), feature.key] })} />
                  <span className="truncate">{feature.label}</span>
                </label>;
              })}
            </div>
          </>
        ) : null}


    </>
  );
  if (inline) return <>{trigger}{open ? <div role="dialog" aria-label="סינון מתקדם" data-property-filter-panel dir="rtl" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }} className="absolute -inset-x-px top-full z-50 mt-1 max-h-[60dvh] space-y-3 overflow-y-auto overscroll-contain rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md animate-in fade-in-0 slide-in-from-top-2 motion-reduce:animate-none">{content}</div> : null}</>;
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>{trigger}</PopoverTrigger><PopoverContent align="start" onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()} className="max-h-[70dvh] w-80 space-y-3 overflow-y-auto overscroll-contain p-3" dir="rtl">{content}</PopoverContent></Popover>;

}

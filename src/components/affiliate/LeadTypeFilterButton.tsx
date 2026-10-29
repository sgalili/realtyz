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
import { ClipboardList, Phone, Filter, Trophy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { LeadPriceSlider } from '@/components/public/LeadPriceSlider';
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

  const toggle = (key: LeadTypeKey) => {
    const types = state.types.includes(key)
      ? state.types.filter((value) => value !== key)
      : [...state.types, key];
    onChange({ ...state, types });
  };

  const BOUND_KEY = { tier1: 'form', tier2: 'whatsapp', tier3: 'phone', tier4: 'closing' } as const;
  const activeType: LeadTypeKey = leadTypes.find((key) => state.types.includes(key)) ?? leadTypes[0];
  const sliderTier = activeType === 'tier1' ? 'form' : activeType === 'tier2' ? 'whatsapp' : 'phone';
  const liveBound = bounds.data?.[BOUND_KEY[activeType]];
  const sliderRange = liveBound?.min != null && liveBound?.max != null && Number(liveBound.max) > Number(liveBound.min)
    ? { min: Number(liveBound.min), max: Number(liveBound.max) } : undefined;
  // Opening the filter selects the first lead type by default.
  useEffect(() => {
    if (open && showLeadFilters && !state.types.length) onChange({ ...state, types: [leadTypes[0]] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showLeadFilters]);

  const patch = (next: Partial<PropertyFilterState>) => {
    if (property && onPropertyChange) onPropertyChange({ ...property, ...next });
  };

  const reset = () => {
    onChange(EMPTY_LEAD_FILTER);
    if (onPropertyChange) onPropertyChange(EMPTY_PROPERTY_FILTER);
  };

  const show = (field: PropertyField) => !!property && fields.includes(field);

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
        {active ? <Button type="button" size="sm" variant="ghost" className="ms-auto h-7 px-2 text-[15px]" onClick={reset}>ניקוי סינון</Button> : null}
      </div>
        {showLeadFilters ? (<>
          <SectionTitle>רווח לליד</SectionTitle>
          <div className="space-y-1.5">
            {leadTypes.map((key) => {
              const Icon = ICONS[key];
              return (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-[15px] font-medium">
                  <Checkbox checked={state.types.includes(key)} onCheckedChange={() => toggle(key)} />
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {FILTER_LEAD_LABELS[key]}
                </label>
              );
            })}
          </div>
          <div className="space-y-1">
            
            <LeadPriceSlider hidePotential range={sliderRange} key={activeType} tier={sliderTier} label="שווי ליד מינימלי" value={String(state.min ?? 0)} onChange={(value) => { const n = Number(value) || 0; onChange({ ...state, min: n > 0 ? n : null, max: null }); }} />
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
              {show('propertyType') && propertyTypes.length ? (
                <div className="space-y-1">
                  <Select value={property.propertyType} onValueChange={(value) => patch({ propertyType: value })}>
                    <SelectTrigger aria-label="סוג נכס" className="h-9 text-[16px]"><SelectValue placeholder="סוג נכס" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">סוג נכס</SelectItem>
                      {propertyTypes.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
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
              {show('rooms') ? <div className="col-span-2"><RangeRow label="חדרים" min={property.roomsMin} max={property.roomsMax} step={0.5} onChange={({ min, max }) => patch({ roomsMin: min, roomsMax: max })} /></div> : null}
              {show('size') ? <div className="col-span-2"><RangeRow label="שטח" suffix='מ"ר' min={property.sizeMin} max={property.sizeMax} step={5} onChange={({ min, max }) => patch({ sizeMin: min, sizeMax: max })} /></div> : null}
              {show('floor') ? <div className="col-span-2"><RangeRow label="קומה" min={property.floorMin} max={property.floorMax} onChange={({ min, max }) => patch({ floorMin: min, floorMax: max })} /></div> : null}
            </div>
            <SectionTitle>מאפיינים</SectionTitle>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
              {FILTER_FEATURES.map(feature => {
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

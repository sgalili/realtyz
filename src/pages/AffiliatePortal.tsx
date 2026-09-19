// Affiliate Portal — the ONLY screen an affiliate-only account sees.
//
// Deliberately narrow: no CRM, no office settings, no broker tools. An affiliate
// browses broker-approved properties, sees exactly what they earn per closing,
// and generates a personal tracking link to market with.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Banknote,
  BedDouble,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Images as ImageIcon,
  Building2,
  Copy,
  HelpCircle,
  Link2,
  List,
  LayoutGrid,
  MapPin,
  Megaphone,
  MousePointerClick,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import CommissionTierBadges from '@/components/affiliate/CommissionTierBadges';
import SubmitLeadDialog from '@/components/affiliate/SubmitLeadDialog';
import {
  REFERRAL_STATUS_LABELS,
  SETTLEMENT_LABELS,
  affiliateTrackingLink,
  formatReward,
  useAffiliateMarketplace,
  useMyReferrals,
  listingTiers,
  useMySubmissions,
  accruedEarnings,
  SUBMISSION_STATUS_LABELS,
  useRegisterAffiliate,
  useStartPromoting,
  type MarketplaceListing,
} from '@/hooks/useAffiliate';
import { useAffiliatePreferences } from '@/hooks/useAffiliate';
import { useUserRole } from '@/hooks/useUserRole';
import { fmtILS } from '@/lib/formatCurrency';
import BrokerAttribution from '@/components/properties/BrokerAttribution';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ViewModeSwitch } from '@/components/ui/view-mode-switch';
import { RitaAvatar } from '@/components/RitaAvatar';
import { ResultTable } from '@/pages/Properties';
import type { UnifiedResult } from '@/lib/propertySearch';

const DEAL_TYPE_LABELS: Record<string, string> = {
  sale: 'למכירה',
  rent: 'להשכרה',
};

function firstPhoto(listing: MarketplaceListing): string | null {
  if (listing.image_url) return listing.image_url;
  const photos = listing.media_photos;
  if (Array.isArray(photos)) {
    const first = photos[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object' && 'url' in (first as Record<string, unknown>)) {
      return String((first as Record<string, unknown>).url);
    }
  }
  return null;
}

function commissionPotential(listing: MarketplaceListing): number {
  const tiers = listingTiers(listing);
  const fixedClosing = tiers.tier3Type === 'fixed' ? tiers.tier3 : 0;
  return tiers.tier1 + tiers.tier2 + fixedClosing;
}

function marketplaceResult(listing: MarketplaceListing): UnifiedResult {
  return {
    key: `affiliate:${listing.listing_id}`,
    source: 'mine',
    sources: ['mine'],
    localId: listing.listing_id,
    title: listing.property_title || 'נכס ללא כותרת',
    price: listing.asking_price,
    city: listing.city,
    address: listing.address,
    neighborhood: listing.neighborhood,
    rooms: listing.rooms,
    size_sqm: listing.sqm,
    photos: allPhotos(listing),
    url: null,
    listing_type: listing.deal_type === 'rent' ? 'rent' : 'sale',
    property_type: listing.property_type,
    raw: listing,
    updated_at: listing.approved_at,
  };
}

function PartnerListingActions({ listing }: { listing: MarketplaceListing }) {
  const promote = useStartPromoting();
  const [link, setLink] = useState<string | null>(null);
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('הקישור הועתק');
    } catch {
      toast.error('ההעתקה נכשלה');
    }
  };
  const createOrCopy = () => {
    if (link) return void copy(link);
    promote.mutate({ listing }, {
      onSuccess: (result) => {
        setLink(result.link);
        void copy(result.link);
      },
      onError: () => toast.error('יצירת הקישור נכשלה'),
    });
  };
  return (
    <div className="flex items-center gap-1.5">
      {/* Icon-only action: the title carries the meaning, no text label. */}
      <Button
        type="button"
        size="icon"
        onClick={createOrCopy}
        disabled={promote.isPending}
        className="h-8 w-8"
        title={link ? 'העתקת קישור השיווק' : 'יצירת קישור שיווק'}
        aria-label={link ? 'העתקת קישור השיווק' : 'יצירת קישור שיווק'}
      >
        {link ? <Copy className="h-3.5 w-3.5" /> : <Megaphone className="h-3.5 w-3.5" />}
      </Button>
      <SubmitLeadDialog listing={listing} />
    </div>
  );
}

/** Self-signup card for a signed-in user who is not yet an affiliate. */
function JoinAffiliateCard() {
  const register = useRegisterAffiliate();
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');

  return (
    <div className="mx-auto max-w-lg py-10">
      <Card className="border-slate-200">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 ring-1 ring-sky-200">
            <Sparkles className="h-6 w-6 text-sky-600" />
          </div>
          <CardTitle className="text-xl font-bold text-slate-900">הרשמה לרשת השותפים</CardTitle>
          <p className="text-sm text-slate-500">
            שווקו נכסים של מתווכים מהרשת וקבלו תגמול על כל עסקה שנחתמת דרככם.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="שם לתצוגה"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Input
            placeholder="טלפון ליצירת קשר"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
          />
          <Button
            className="w-full"
            disabled={register.isPending}
            onClick={() =>
              register.mutate(
                { displayName: displayName.trim() || undefined, phone: phone.trim() || undefined },
                {
                  onSuccess: () => toast.success('נרשמתם לרשת השותפים'),
                  onError: () => toast.error('ההרשמה נכשלה, נסו שוב'),
                },
              )
            }
          >
            {register.isPending ? 'רושם...' : 'הצטרפות לרשת'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/** All photos of a marketplace listing (cover first). */
function allPhotos(listing: MarketplaceListing): string[] {
  const out: string[] = [];
  if (listing.image_url) out.push(listing.image_url);
  const photos = listing.media_photos;
  if (Array.isArray(photos)) {
    for (const p of photos) {
      if (typeof p === 'string') out.push(p);
      else if (p && typeof p === 'object' && 'url' in (p as Record<string, unknown>)) {
        out.push(String((p as Record<string, unknown>).url));
      }
    }
  }
  return Array.from(new Set(out.filter(Boolean)));
}

/**
 * Marketplace listing card — same layout/design language as the /properties
 * grid cards: full-width title row, 16/10 gallery with photo counter and
 * navigation, badges over the image, compact meta row, and an expandable
 * details section holding the full affiliate tooling.
 */
function MarketplaceCard({ listing, compact = false }: { listing: MarketplaceListing; compact?: boolean }) {
  const promote = useStartPromoting();
  const [link, setLink] = useState<string | null>(null);
  const photos = useMemo(() => allPhotos(listing), [listing]);
  const hasPhotos = photos.length > 0;
  const hasMany = photos.length > 1;
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const activePhoto = hasPhotos ? photos[Math.min(index, photos.length - 1)] : null;
  const isRent = listing.deal_type === 'rent';
  const title = listing.property_title || 'נכס ללא כותרת';
  const fullAddress = [listing.address, listing.city].filter(Boolean).join(', ') || 'כתובת לא צוינה';

  const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); e.preventDefault(); };
  const goPrev = (e: React.SyntheticEvent) => { stop(e); setIndex((i) => (i - 1 + photos.length) % photos.length); };
  const goNext = (e: React.SyntheticEvent) => { stop(e); setIndex((i) => (i + 1) % photos.length); };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('הקישור הועתק');
    } catch {
      toast.error('ההעתקה נכשלה');
    }
  };

  return (
    <Card
      className="group relative flex cursor-pointer flex-col overflow-hidden transition-shadow hover:shadow-lg"
      onClick={() => setExpanded((v) => !v)}
    >
      {compact ? (
        <div className="flex min-h-14 items-center gap-3 px-3 py-2">
          <div className="h-[50px] w-[50px] shrink-0 overflow-hidden rounded-md bg-muted">
            {activePhoto ? (
              <img src={activePhoto} alt={title} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="m-[13px] h-6 w-6 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(90px,1fr)_auto_auto_auto] items-center gap-x-3 text-sm">
            <span className="text-[15px] font-semibold leading-tight text-foreground" title={fullAddress}>{fullAddress}</span>
            <span className="text-muted-foreground">{listing.rooms ? `${listing.rooms} חד׳` : '—'}</span>
            <span className="text-muted-foreground">{listing.sqm ? `${listing.sqm} מ״ר` : '—'}</span>
            <span className="text-[15px] font-bold text-foreground" dir="ltr">{listing.asking_price ? fmtILS(listing.asking_price) : '—'}</span>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={(e) => { stop(e); setExpanded((v) => !v); }}
            className="h-9 w-9 shrink-0"
            aria-label={expanded ? 'סגירת פרטי הנכס' : 'פתיחת פרטי הנכס'}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp className="h-[18px] w-[18px]" /> : <ChevronDown className="h-[18px] w-[18px]" />}
          </Button>
        </div>
      ) : (
        <>
      {/* Dedicated full-width title row — always the first element of the card. */}
      <div className="w-full border-b px-4 pb-2 pt-3">
        <h3 className="w-full truncate text-base font-semibold leading-tight" title={title}>
          {title}
        </h3>
      </div>

      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {activePhoto ? (
          <img
            key={activePhoto}
            src={activePhoto}
            alt={`${title} — ${index + 1}/${photos.length}`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            אין תמונה
          </div>
        )}

        {photos.length > 0 && (
          <button
            type="button"
            onClick={(e) => { stop(e); setExpanded((v) => !v); }}
            className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm"
            title={`${photos.length} תמונות`}
            aria-label={`${photos.length} תמונות`}
          >
            <ImageIcon className="h-3 w-3" />
            {photos.length}
          </button>
        )}

        {hasMany && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="תמונה קודמת"
              className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/70 text-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:bg-background focus:opacity-100 group-hover:opacity-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="תמונה הבאה"
              className="absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-background/70 text-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:bg-background focus:opacity-100 group-hover:opacity-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-foreground shadow-sm backdrop-blur-sm">
              {index + 1} / {photos.length}
            </div>
          </>
        )}

        <Badge className="absolute bottom-2 right-2 z-10 bg-emerald-600 text-white hover:bg-emerald-600">
          {formatReward(listing.reward_type, listing.reward_amount)}
        </Badge>

        {listing.deal_type && (
          <Badge
            className={`absolute left-3 top-3 z-10 border ${isRent ? 'border-[#0b3982] bg-[#0b3982] text-white' : 'bg-primary text-primary-foreground'}`}
          >
            {DEAL_TYPE_LABELS[listing.deal_type] ?? listing.deal_type}
          </Badge>
        )}
      </div>

      <BrokerAttribution
        brokerName={listing.broker_name}
        officeName={listing.office_name}
        licenceNumber={listing.broker_license_number}
        logoUrl={listing.agency_logo_url}
      />
        </>
      )}

      {/* Thumbnail row — mounted only once the card is expanded */}
      {hasMany && expanded && (
        <div
          className="scrollbar-thin flex gap-1.5 overflow-x-auto border-b bg-muted/40 px-2 py-2"
          dir="rtl"
          onClick={stop}
          onWheel={(e) => e.stopPropagation()}
        >
          {photos.map((p, i) => (
            <button
              key={`${p}-${i}`}
              type="button"
              onClick={(e) => { stop(e); setIndex(i); }}
              aria-label={`תמונה ${i + 1}`}
              className={`relative h-10 w-14 shrink-0 overflow-hidden rounded-md border transition-all ${i === index ? 'border-primary ring-2 ring-primary/40' : 'border-border/60 opacity-70 hover:opacity-100'}`}
            >
              <img src={p} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className={`flex flex-1 flex-col gap-3 ${compact ? (expanded ? 'border-t p-3' : 'hidden') : 'p-4'}`}>
        {compact ? (
          <BrokerAttribution
            brokerName={listing.broker_name}
            officeName={listing.office_name}
            licenceNumber={listing.broker_license_number}
            logoUrl={listing.agency_logo_url}
            compact
          />
        ) : null}
        {!compact ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{fullAddress}</span>
          </span>
          {listing.rooms ? (
            <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" /> {listing.rooms} חד'</span>
          ) : null}
        </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <div className={compact ? 'hidden' : 'text-lg font-bold text-slate-900'} dir="ltr">
            {listing.asking_price ? <bdi>{fmtILS(listing.asking_price)}</bdi> : <span className="text-sm text-muted-foreground">מחיר לא צוין</span>}
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={(e) => { stop(e); setExpanded((v) => !v); }}
            className={compact ? 'hidden' : 'h-9 w-9 text-primary'}
            aria-label={expanded ? 'סגירת פרטי הנכס' : 'פתיחת פרטי הנכס'}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp className="h-[18px] w-[18px]" /> : <ChevronDown className="h-[18px] w-[18px]" />}
          </Button>
        </div>

        {expanded && (
          <div className="space-y-3 border-t pt-3" onClick={stop}>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <dt className="text-muted-foreground">כתובת</dt>
                <dd className="font-semibold text-slate-900">{fullAddress}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">סוג עסקה</dt>
                <dd className="font-semibold text-slate-900">
                  {listing.deal_type ? DEAL_TYPE_LABELS[listing.deal_type] ?? listing.deal_type : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">חדרים</dt>
                <dd className="font-semibold text-slate-900">{listing.rooms ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">מחיר</dt>
                <dd className="font-semibold text-slate-900" dir="ltr">
                  {listing.asking_price ? fmtILS(listing.asking_price) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">תגמול</dt>
                <dd className="font-semibold text-emerald-700">
                  {formatReward(listing.reward_type, listing.reward_amount)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">אושר לשיווק</dt>
                <dd className="font-semibold text-slate-900">
                  {listing.approved_at ? new Date(listing.approved_at).toLocaleDateString('he-IL') : '—'}
                </dd>
              </div>
            </dl>

            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-500">פירוט העמלה ב-3 שלבים</div>
              <CommissionTierBadges tiers={listingTiers(listing)} />
            </div>

            <SubmitLeadDialog listing={listing} />

            {link ? (
              <div className="space-y-2">
                <div className="truncate rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600 ring-1 ring-slate-200">
                  <bdi dir="ltr">{link}</bdi>
                </div>
                <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => copy(link)}>
                  <Copy className="h-3.5 w-3.5" />
                  העתקת קישור השיווק
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                className="w-full gap-1.5"
                disabled={promote.isPending}
                onClick={() =>
                  promote.mutate(
                    { listing },
                    {
                      onSuccess: (res) => {
                        setLink(res.link);
                        toast.success('קישור שיווק אישי נוצר');
                      },
                      onError: () => toast.error('יצירת הקישור נכשלה'),
                    },
                  )
                }
              >
                <Megaphone className="h-3.5 w-3.5" />
                {promote.isPending ? 'מכין קישור...' : 'קבלת קישור לשיווק'}
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );

}

/** Metric box styled exactly like the dashboard KPI cards. */
function AffiliateKpiCard({
  icon: Icon,
  label,
  value,
  tooltip,
  accent = 'primary',
}: {
  icon: typeof Megaphone;
  label: string;
  value: string;
  tooltip: string;
  accent?: 'primary' | 'success' | 'warning';
}) {
  const accentColor = {
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
  }[accent];
  const accentBg = {
    primary: 'bg-primary/10',
    success: 'bg-success/10',
    warning: 'bg-warning/10',
  }[accent];

  return (
    <TooltipProvider delayDuration={120}>
      <UiTooltip>
        <Card dir="rtl" className="relative overflow-hidden border border-border/80 bg-card shadow-sm">
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="מידע על המדד"
              className="absolute left-2 top-2 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <CardContent className="flex flex-col items-center gap-2 px-3 py-4 text-center sm:px-4">
            <div className={`grid h-10 w-10 place-items-center rounded-full ${accentBg}`}>
              <Icon className={`h-5 w-5 ${accentColor}`} />
            </div>
            <p className="text-sm font-medium leading-none text-muted-foreground sm:text-[15px]">{label}</p>
            <p className={`text-2xl font-black tabular-nums sm:text-[28px] ${accentColor}`} dir="ltr">
              {value}
            </p>
          </CardContent>
        </Card>
        <TooltipContent side="top" align="center">
          <p className="max-w-56 text-center text-xs leading-relaxed">{tooltip}</p>
        </TooltipContent>
      </UiTooltip>
    </TooltipProvider>
  );
}

export default function AffiliatePortal() {
  const navigate = useNavigate();
  const { isAffiliate, loading: roleLoading } = useUserRole();
  const { data: marketplace = [], isLoading: marketLoading } = useAffiliateMarketplace();
  const { data: referrals = [], isLoading: refLoading } = useMyReferrals();
  const { data: submissions = [], isLoading: subsLoading } = useMySubmissions();
  const { preferences, update: updatePreferences, isUpdating: preferencesUpdating } = useAffiliatePreferences();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('marketplace');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [funnelDialogOpen, setFunnelDialogOpen] = useState(false);
  const [commissionRange, setCommissionRange] = useState<[number, number]>([0, 0]);
  const [propertyType, setPropertyType] = useState('all');
  const [city, setCity] = useState('all');
  const [neighborhood, setNeighborhood] = useState('all');
  const [rooms, setRooms] = useState('all');
  const [dealType, setDealType] = useState('all');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 0]);

  const commissionMax = useMemo(() => Math.max(1000, ...marketplace.map(commissionPotential)), [marketplace]);
  const priceMax = useMemo(() => Math.max(10000, ...marketplace.map((item) => Number(item.asking_price ?? 0))), [marketplace]);
  const effectiveCommissionRange: [number, number] = commissionRange[1] > 0 ? commissionRange : [0, commissionMax];
  const effectivePriceRange: [number, number] = priceRange[1] > 0 ? priceRange : [0, priceMax];
  const propertyTypes = useMemo(() => [...new Set(marketplace.map((item) => item.property_type).filter(Boolean))] as string[], [marketplace]);
  const cities = useMemo(() => [...new Set(marketplace.map((item) => item.city).filter(Boolean))] as string[], [marketplace]);
  const neighborhoods = useMemo(() => [...new Set(marketplace.filter((item) => city === 'all' || item.city === city).map((item) => item.neighborhood).filter(Boolean))] as string[], [marketplace, city]);
  const activeFilterCount = [propertyType, city, neighborhood, rooms, dealType].filter((value) => value !== 'all').length
    + (effectiveCommissionRange[0] > 0 || effectiveCommissionRange[1] < commissionMax ? 1 : 0)
    + (effectivePriceRange[0] > 0 || effectivePriceRange[1] < priceMax ? 1 : 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return marketplace.filter((l) => {
      const matchesText = !q || [l.property_title, l.address, l.city, l.neighborhood, l.property_type]
        .some((f) => (f ?? '').toLowerCase().includes(q));
      const commission = commissionPotential(l);
      const price = Number(l.asking_price ?? 0);
      return matchesText
        && commission >= effectiveCommissionRange[0]
        && commission <= effectiveCommissionRange[1]
        && price >= effectivePriceRange[0]
        && price <= effectivePriceRange[1]
        && (propertyType === 'all' || l.property_type === propertyType)
        && (city === 'all' || l.city === city)
        && (neighborhood === 'all' || l.neighborhood === neighborhood)
        && (rooms === 'all' || Number(l.rooms) >= Number(rooms))
        && (dealType === 'all' || l.deal_type === dealType);
    });
  }, [marketplace, search, effectiveCommissionRange, effectivePriceRange, propertyType, city, neighborhood, rooms, dealType]);

  const clearFilters = () => {
    setCommissionRange([0, commissionMax]);
    setPriceRange([0, priceMax]);
    setPropertyType('all');
    setCity('all');
    setNeighborhood('all');
    setRooms('all');
    setDealType('all');
  };

  const filteredSubmissions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter((s) => [s.lead_name, s.lead_phone, s.listing?.property_title]
      .some((value) => (value ?? '').toLowerCase().includes(q)));
  }, [submissions, search]);

  const filteredReferrals = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return referrals;
    return referrals.filter((r) => [r.tracking_code, REFERRAL_STATUS_LABELS[r.status], SETTLEMENT_LABELS[r.settlement_status]]
      .some((value) => (value ?? '').toLowerCase().includes(q)));
  }, [referrals, search]);

  const searchPlaceholder = activeTab === 'leads'
    ? 'חיפוש אנשי קשר שהגשתי'
    : activeTab === 'mine'
      ? 'חיפוש השיווקים שלי'
      : 'חיפוש נכסים לשיווק';

  const stats = useMemo(() => {
    const clicks = referrals.reduce((sum, r) => sum + (r.clicks ?? 0), 0);
    const signed = referrals.filter((r) => r.status === 'deal_signed');
    const earned = signed
      .filter((r) => r.reward_type === 'fixed')
      .reduce((sum, r) => sum + Number(r.reward_amount ?? 0), 0);
    const submissionEarned = submissions.reduce((sum, s) => sum + accruedEarnings(s), 0);
    return {
      promoting: referrals.length,
      clicks,
      signed: signed.length + submissions.filter((s) => s.status === 'closed').length,
      earned: earned + submissionEarned,
      leads: submissions.length,
    };
  }, [referrals, submissions]);

  if (roleLoading) {
    return (
      <>
        <div className="space-y-4 p-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    );
  }

  if (!isAffiliate) {
    return (
      <>
        <JoinAffiliateCard />
      </>
    );
  }

  return (
    <>
      <div className="space-y-5 p-4" dir="rtl">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <RitaAvatar className="h-9 w-9" />
              <div className="min-w-0">
                <div className="text-sm font-semibold">ריטה, הסוכנת האישית</div>
                <div className="text-xs text-muted-foreground">
                  {preferences.rita_auto_mode
                    ? 'מצב אוטומטי: ריטה עונה לכל פנייה, מציגה נכסים ומזמנת סיורים בשמכם'
                    : 'מצב ידני: ריטה מכינה תשובה ואתם שולחים'}
                </div>
              </div>
            </div>
            <Switch
              checked={preferences.rita_auto_mode}
              disabled={preferencesUpdating}
              onCheckedChange={(checked) => updatePreferences({ rita_auto_mode: checked }, { onError: () => toast.error('שמירת מצב ריטה נכשלה') })}
              aria-label="הפעלה אוטומטית של ריטה"
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">הוספה אוטומטית למשפך</div>
              <div className="text-xs text-muted-foreground">נכסים חדשים יתווספו לשיווק באופן אוטומטי</div>
            </div>
            <Switch
              checked={preferences.auto_funnel_enabled}
              disabled={preferencesUpdating}
              onCheckedChange={(checked) => {
                if (checked) { setFunnelDialogOpen(true); return; }
                updatePreferences({ auto_funnel_enabled: false }, { onError: () => toast.error('שמירת הגדרת המשפך נכשלה') });
              }}
              aria-label="הוספה אוטומטית למשפך"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            {
              label: 'נכסים בשיווק',
              value: String(stats.promoting),
              icon: Megaphone,
              accent: 'primary' as const,
              tooltip: 'מספר הנכסים שיצרתם עבורם קישור שיווק אישי.',
            },
            {
              label: 'אנשי קשר שהוגשו',
              value: String(stats.leads),
              icon: MousePointerClick,
              accent: 'primary' as const,
              tooltip: 'סך אנשי הקשר שהגשתם לנכסים של מתווכים מהרשת.',
            },
            {
              label: 'עסקאות שנחתמו',
              value: String(stats.signed),
              icon: TrendingUp,
              accent: 'success' as const,
              tooltip: 'עסקאות שנסגרו בעקבות הפניות שלכם.',
            },
            {
              label: 'תגמול מצטבר',
              value: fmtILS(stats.earned),
              icon: Banknote,
              accent: 'warning' as const,
              tooltip: 'סך התגמול שנצבר לזכותכם מכל העסקאות שנסגרו.',
            },
          ].map((s) => (
            <AffiliateKpiCard key={s.label} {...s} />
          ))}
        </div>

        <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); setSearch(''); }}>
          <div className="flex items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="marketplace">נכסים לשיווק</TabsTrigger>
              <TabsTrigger value="leads">אנשי הקשר שהגשתי</TabsTrigger>
              <TabsTrigger value="mine">השיווקים שלי</TabsTrigger>
            </TabsList>
            <div className="flex shrink-0 items-center" aria-label="בחירת תצוגה">
              <ViewModeSwitch isGrid={viewMode === 'grid'} onToggle={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} />
            </div>

          <div className="mt-4 flex max-w-lg items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input placeholder={searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
            </div>
            {activeTab === 'marketplace' ? (
              <Button type="button" size="icon" variant={activeFilterCount ? 'default' : 'outline'} onClick={() => setFiltersOpen(true)} className="relative shrink-0" aria-label="סינון נכסים" title="סינון נכסים">
                <SlidersHorizontal className="h-4 w-4" />
                {activeFilterCount ? <span className="absolute -left-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">{activeFilterCount}</span> : null}
              </Button>
            ) : null}
          </div>

          <TabsContent value="marketplace" className="space-y-4 pt-4">
            {marketLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <Card className="border-dashed border-slate-200">
                <CardContent className="p-10 text-center text-sm text-slate-500">
                  אין כרגע נכסים פתוחים לשיווק. מתווכים מוסיפים נכסים לרשת באופן שוטף.
                </CardContent>
              </Card>
            ) : (
              viewMode === 'list' ? (
                <ResultTable
                  results={filtered.map(marketplaceResult)}
                  importingKey={null}
                  onSelect={(result) => {
                    const listing = filtered.find((item) => item.listing_id === result.localId);
                    if (listing) navigate(`/p/${listing.slug || listing.listing_id}`);
                  }}
                  propertyHref={(result) => {
                    const listing = filtered.find((item) => item.listing_id === result.localId);
                    return listing ? `/p/${listing.slug || listing.listing_id}` : null;
                  }}
                  hideDefaultActions
                  affiliateCell={(result) => {
                    const listing = filtered.find((item) => item.listing_id === result.localId);
                    return listing ? <PartnerListingActions listing={listing} /> : null;
                  }}
                  commissionCell={(result) => {
                    const listing = filtered.find((item) => item.listing_id === result.localId);
                    return listing ? <CommissionTierBadges tiers={listingTiers(listing)} compact /> : null;
                  }}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((l) => <MarketplaceCard key={l.listing_id} listing={l} />)}
                </div>
              )
            )}
          </TabsContent>

          <TabsContent value="leads" className="space-y-3 pt-4">
            {subsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : filteredSubmissions.length === 0 ? (
              <Card className="border-dashed border-slate-200">
                <CardContent className="p-10 text-center text-sm text-slate-500">
                  עוד לא הגשתם אנשי קשר. בחרו נכס ולחצו "הגשת איש קשר לנכס".
                </CardContent>
              </Card>
            ) : (
              filteredSubmissions.map((s) => {
                const stage = s.status === 'closed' ? 3 : s.status === 'verified' ? 2 : s.status === 'rejected' ? 0 : 1;
                return (
                  <Card key={s.id} className="border-slate-200">
                    <CardContent className="space-y-2.5 p-3.5">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-slate-900">{s.lead_name}</div>
                          <div className="truncate text-[11px] text-slate-500">
                            {s.listing?.property_title || 'נכס'}
                            {s.lead_phone ? <> · <bdi dir="ltr">{s.lead_phone}</bdi></> : null}
                            {' · '}
                            {new Date(s.created_at).toLocaleDateString('he-IL')}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[11px]">
                          {SUBMISSION_STATUS_LABELS[s.status] ?? s.status}
                        </Badge>
                        <Badge variant="outline" className="text-[11px]">
                          {SETTLEMENT_LABELS[s.settlement_status] ?? s.settlement_status}
                        </Badge>
                        <div className="text-sm font-bold text-emerald-700">
                          <bdi dir="ltr">{fmtILS(accruedEarnings(s))}</bdi>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3].map((n) => (
                          <div
                            key={n}
                            className={`h-1.5 flex-1 rounded-full ${stage >= n ? 'bg-emerald-500' : 'bg-slate-200'}`}
                          />
                        ))}
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>הוגש</span>
                        <span>אומת</span>
                        <span>נסגר</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>


          <TabsContent value="mine" className="pt-4">
            {refLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : filteredReferrals.length === 0 ? (
              <Card className="border-dashed border-slate-200">
                <CardContent className="p-10 text-center text-sm text-slate-500">
                  עוד לא התחלתם לשווק נכסים. עברו ללשונית "נכסים לשיווק".
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2.5">
                {filteredReferrals.map((r) => (
                  <Card key={r.id} className="border-slate-200">
                    <CardContent className="flex flex-wrap items-center gap-3 p-3.5">
                      <Link2 className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          <bdi dir="ltr">{r.tracking_code}</bdi>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {new Date(r.created_at).toLocaleDateString('he-IL')} · {r.clicks} כניסות
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[11px]">
                        {REFERRAL_STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                      <Badge variant="outline" className="text-[11px]">
                        {SETTLEMENT_LABELS[r.settlement_status] ?? r.settlement_status}
                      </Badge>
                      <div className="text-sm font-bold text-emerald-700">
                        {formatReward(r.reward_type, r.reward_amount)}
                      </div>
                      {r.listing_id && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="העתקת הקישור"
                          aria-label="העתקת הקישור"
                          onClick={async () => {
                            await navigator.clipboard.writeText(
                              affiliateTrackingLink(null, r.listing_id, r.tracking_code),
                            );
                            toast.success('הקישור הועתק');
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={funnelDialogOpen} onOpenChange={setFunnelDialogOpen}>
          <DialogContent dir="rtl" className="max-w-md">
            <DialogHeader className="text-right">
              <DialogTitle>הוספה אוטומטית למשפך</DialogTitle>
              <DialogDescription className="text-right leading-relaxed">
                כל נכס חדש שייפתח לשיווק שותפים ייכנס אוטומטית למשפך השיווק שלכם, עם קישור אישי ומעקב תגמולים.
                אפשר לבחור אילו נכסים ייכנסו: סוג נכס, עיר, חדרים, סוג עסקה, טווח מחירים וטווח התגמול הנדרש.
              </DialogDescription>
            </DialogHeader>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between"
              onClick={() => { setFunnelDialogOpen(false); setFiltersOpen(true); }}
            >
              הגדרת מסננים ותגמול נדרש
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
            <DialogFooter className="gap-2 sm:space-x-0">
              <Button
                disabled={preferencesUpdating}
                onClick={() => updatePreferences({ auto_funnel_enabled: true }, {
                  onSuccess: () => { setFunnelDialogOpen(false); toast.success('הוספה אוטומטית למשפך הופעלה'); },
                  onError: () => toast.error('שמירת הגדרת המשפך נכשלה'),
                })}
              >
                {preferencesUpdating ? 'שומר...' : 'הפעלה'}
              </Button>
              <Button variant="outline" onClick={() => setFunnelDialogOpen(false)}>ביטול</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent side="right" dir="rtl" className="w-[92vw] overflow-y-auto sm:max-w-md">
            <SheetHeader className="text-right">
              <SheetTitle>סינון חכם לנכסים</SheetTitle>
            </SheetHeader>
            <div className="space-y-6 py-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3"><Label>פוטנציאל תגמול</Label><bdi dir="ltr" className="text-sm font-semibold">{fmtILS(effectiveCommissionRange[0])} – {fmtILS(effectiveCommissionRange[1])}</bdi></div>
                <Slider min={0} max={commissionMax} step={100} value={effectiveCommissionRange} onValueChange={(value) => setCommissionRange([value[0] ?? 0, value[1] ?? commissionMax])} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>סוג נכס</Label><Select value={propertyType} onValueChange={setPropertyType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">כל הסוגים</SelectItem>{propertyTypes.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>עיר</Label><Select value={city} onValueChange={(value) => { setCity(value); setNeighborhood('all'); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">כל הערים</SelectItem>{cities.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>שכונה</Label><Select value={neighborhood} onValueChange={setNeighborhood}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">כל השכונות</SelectItem>{neighborhoods.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>מספר חדרים</Label><Select value={rooms} onValueChange={setRooms}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">הכול</SelectItem>{['2','3','4','5','6'].map((value) => <SelectItem key={value} value={value}>{value}+ חדרים</SelectItem>)}</SelectContent></Select></div>
                <div className="col-span-2 space-y-2"><Label>סוג עסקה</Label><Select value={dealType} onValueChange={setDealType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">השכרה ומכירה</SelectItem><SelectItem value="rent">להשכרה</SelectItem><SelectItem value="sale">למכירה</SelectItem></SelectContent></Select></div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3"><Label>מחיר הנכס</Label><bdi dir="ltr" className="text-sm font-semibold">{fmtILS(effectivePriceRange[0])} – {fmtILS(effectivePriceRange[1])}</bdi></div>
                <Slider min={0} max={priceMax} step={dealType === 'rent' ? 500 : 50000} value={effectivePriceRange} onValueChange={(value) => setPriceRange([value[0] ?? 0, value[1] ?? priceMax])} />
              </div>
            </div>
            <SheetFooter className="gap-2 sm:space-x-0">
              <Button onClick={() => setFiltersOpen(false)}>הצגת {filtered.length} נכסים</Button>
              <Button variant="outline" onClick={clearFilters}>ניקוי מסננים</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

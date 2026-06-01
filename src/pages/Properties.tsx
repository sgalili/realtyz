import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Send, BedDouble, Ruler, MapPin, Building2, Plus, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { AddPropertyDialog } from '@/components/properties/AddPropertyDialog';
import { ImportPropertiesDialog } from '@/components/properties/ImportPropertiesDialog';
import {
  MOCK_HOMELY_PROPERTIES,
  PROPERTY_TYPE_LABELS_HE,
  CITY_OPTIONS,
  LISTING_TYPE_LABELS_HE,
  type HomelyProperty,
  type PropertyType,
  type ListingType,
} from '@/lib/homelyMockProperties';
import { ShareWithLeadDialog } from '@/components/properties/ShareWithLeadDialog';
import { ReferralButton } from '@/components/referrals/ReferralButton';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useServiceAreas } from '@/hooks/useServiceAreas';
import { isInServiceArea } from '@/lib/serviceAreas';

const PRICE_MIN = 0;
const PRICE_MAX = 10_000_000;
const PRICE_STEP = 100_000;

function formatPrice(n: number) {
  return `₪${n.toLocaleString('he-IL')}`;
}

export default function Properties() {
  const { serviceAreas, coveredCities, isConfigured } = useServiceAreas();
  const [listingType, setListingType] = useState<ListingType>('sale');
  // When agent has a hyper-local zone, default the city dropdown to "all my zones"
  // (we use empty string as a sentinel) and hide the legacy "כל הערים" option.
  const [city, setCity] = useState<string>(isConfigured ? '__my_zones__' : 'כל הערים');
  const [propertyType, setPropertyType] = useState<PropertyType | 'all'>('all');
  const [rooms, setRooms] = useState<string>('any');
  const [priceRange, setPriceRange] = useState<[number, number]>([PRICE_MIN, PRICE_MAX]);
  const [areaMin, setAreaMin] = useState<string>('');

  const [shareTarget, setShareTarget] = useState<HomelyProperty | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const queryClient = useQueryClient();
  const refreshListings = () => queryClient.invalidateQueries({ queryKey: ['homely-search'] });

  // Calls homely-search: real Homely if a key is configured, otherwise the
  // function falls back to the local `listings` table. We merge whatever it
  // returns with the mock catalogue so the page is never empty.
  const { data: liveResults, isLoading } = useQuery({
    queryKey: ['homely-search', { city, rooms, propertyType, priceRange, areaMin }],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.functions.invoke('homely-search', {
          body: {
            city: city !== 'כל הערים' ? city : undefined,
            min_price: priceRange[0] > PRICE_MIN ? priceRange[0] : undefined,
            max_price: priceRange[1] < PRICE_MAX ? priceRange[1] : undefined,
            rooms: rooms !== 'any' ? Number(rooms) : undefined,
            limit: 24,
          },
        });
        if (error) throw error;
        return (data?.results ?? []) as Array<Partial<HomelyProperty>>;
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
  });

  const merged = useMemo<HomelyProperty[]>(() => {
    const live = (liveResults ?? []).map((r, i) => ({
      id: String(r.id ?? `live-${i}`),
      source: (r.source as HomelyProperty['source']) ?? 'homely',
      title: r.title ?? '',
      description: r.description ?? '',
      price: Number(r.price ?? 0),
      currency: r.currency ?? '₪',
      city: r.city ?? '',
      rooms: Number(r.rooms ?? 0),
      size_sqm: Number(r.size_sqm ?? 0),
      property_type: 'apartment' as PropertyType,
      photos: Array.isArray(r.photos) ? r.photos as string[] : [],
      url: r.url ?? null,
      features: Array.isArray(r.features) ? r.features as string[] : [],
    }));
    // Mock first so the grid is rich even when the API returns nothing.
    return [...MOCK_HOMELY_PROPERTIES, ...live];
  }, [liveResults]);

  const filtered = useMemo(() => {
    return merged.filter((p) => {
      const pType: ListingType = (p.listing_type ?? 'sale') as ListingType;
      if (pType !== listingType) return false;
      // Hyper-local: when agent has service_areas, ALWAYS restrict to them
      // (regardless of the city dropdown). The dropdown then narrows further.
      if (isConfigured && !isInServiceArea(p.city ?? null, null, serviceAreas)) return false;
      if (city === '__my_zones__') {
        // already filtered by service_areas above, no extra city filter
      } else if (city !== 'כל הערים' && p.city !== city) {
        return false;
      }
      if (propertyType !== 'all' && p.property_type !== propertyType) return false;
      if (rooms !== 'any' && p.rooms < Number(rooms)) return false;
      if (p.price < priceRange[0] || p.price > priceRange[1]) return false;
      if (areaMin && p.size_sqm < Number(areaMin)) return false;
      return true;
    });
  }, [merged, listingType, city, propertyType, rooms, priceRange, areaMin, isConfigured, serviceAreas]);

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6" dir="rtl">
      {/* Hero header */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">
            נכסים
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {isConfigured
              ? `קטלוג הנכסים באזורי ההתמחות שלך (${coveredCities.join(', ')}). סננו לפי תקציב, סוג ופרטים.`
              : 'קטלוג הנכסים. סננו לפי תקציב, אזור, סוג נכס וחדרים, ושלחו ישירות למתעניינים.'}
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {filtered.length} נכסים
        </Badge>
      </header>

      {/* Listing type toggle: למכירה / להשכרה */}
      <div className="flex justify-center">
        <div className="inline-flex items-center rounded-xl border border-primary/20 bg-card/40 p-1 backdrop-blur-md" dir="rtl">
          {(['sale', 'rent'] as ListingType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setListingType(t)}
              className={`px-5 py-2 text-sm font-bold rounded-lg transition-colors ${
                listingType === t
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {LISTING_TYPE_LABELS_HE[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <Card className="p-4 sm:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Price range */}
          <div className="space-y-2 lg:col-span-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">טווח מחירים</Label>
              <span className="text-xs text-muted-foreground">
                {formatPrice(priceRange[0])} , {formatPrice(priceRange[1])}
              </span>
            </div>
            <Slider
              dir="ltr"
              min={PRICE_MIN}
              max={PRICE_MAX}
              step={PRICE_STEP}
              value={priceRange}
              onValueChange={(v) => setPriceRange([v[0], v[1]] as [number, number])}
            />
          </div>

          {/* Area / city */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">אזור</Label>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {isConfigured ? (
                  <>
                    <SelectItem value="__my_zones__">כל אזורי ההתמחות שלי</SelectItem>
                    {coveredCities.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </>
                ) : (
                  CITY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Property type */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">סוג נכס</Label>
            <Select value={propertyType} onValueChange={(v) => setPropertyType(v as PropertyType | 'all')}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PROPERTY_TYPE_LABELS_HE).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bedrooms */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">חדרים (לפחות)</Label>
            <Select value={rooms} onValueChange={setRooms}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">כל מספר</SelectItem>
                {[2, 3, 4, 5, 6].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}+ חדרים</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Min area */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">שטח מינימלי (מ"ר)</Label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="לדוגמה 80"
              value={areaMin}
              onChange={(e) => setAreaMin(e.target.value)}
              className="h-10"
            />
          </div>

          {/* Reset */}
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-full"
              onClick={() => {
                setCity(isConfigured ? '__my_zones__' : 'כל הערים');
                setPropertyType('all');
                setRooms('any');
                setPriceRange([PRICE_MIN, PRICE_MAX]);
                setAreaMin('');
                toast.success('הסינון אופס');
              }}
            >
              איפוס סינון
            </Button>
          </div>
        </div>
      </Card>

      {/* Grid */}
      <ErrorBoundary source="Properties.Grid">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            לא נמצאו נכסים תואמים. נסו להרחיב את הסינון.
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <PropertyCard key={p.id} property={p} onShare={() => setShareTarget(p)} />
            ))}
          </div>
        )}
      </ErrorBoundary>

      <ShareWithLeadDialog
        property={shareTarget}
        open={!!shareTarget}
        onOpenChange={(open) => { if (!open) setShareTarget(null); }}
      />
    </div>
  );
}

function PropertyCard({ property, onShare }: { property: HomelyProperty; onShare: () => void }) {
  const photo = property.photos[0];
  const isRent = property.listing_type === 'rent';
  return (
    <Card className="overflow-hidden flex flex-col group hover:shadow-lg transition-shadow">
      <Link to={`/properties/${property.id}`} className="block">
        <div className="aspect-[16/10] bg-muted relative overflow-hidden">
          {photo ? (
            <img
              src={photo}
              alt={property.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
              אין תמונה
            </div>
          )}
          <Badge className="absolute top-3 right-3 bg-background/90 text-foreground border">
            {PROPERTY_TYPE_LABELS_HE[property.property_type]}
          </Badge>
          {property.listing_type && (
            <Badge className={`absolute top-3 left-3 border ${isRent ? 'bg-amber-500 text-white' : 'bg-primary text-primary-foreground'}`}>
              {LISTING_TYPE_LABELS_HE[property.listing_type]}
            </Badge>
          )}
        </div>
      </Link>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <Link to={`/properties/${property.id}`} className="block">
          <h3 className="font-semibold text-base leading-tight line-clamp-2 hover:text-primary transition-colors">{property.title}</h3>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{property.description}</p>
        </Link>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {property.city && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {property.city}
            </span>
          )}
          {property.rooms ? (
            <span className="inline-flex items-center gap-1">
              <BedDouble className="h-3.5 w-3.5" /> {property.rooms} חד'
            </span>
          ) : null}
          {property.size_sqm ? (
            <span className="inline-flex items-center gap-1">
              <Ruler className="h-3.5 w-3.5" /> {property.size_sqm} מ"ר
            </span>
          ) : null}
        </div>

        <div className="flex items-center justify-between mt-auto pt-2 border-t gap-2 flex-wrap">
          <div className="text-lg font-bold text-success inline-flex items-center gap-1">
            <Building2 className="h-4 w-4 opacity-60" />
            {formatPrice(property.price)}{isRent ? <span className="text-xs font-normal text-muted-foreground">/חודש</span> : null}
          </div>
          <div className="flex items-center gap-1.5">
            <ReferralButton
              subject={{
                kind: 'listing',
                id: property.id,
                label: `${property.title}${property.city ? ' · ' + property.city : ''} · ${formatPrice(property.price)}`,
              }}
            />
            <Button size="sm" onClick={onShare} className="gap-1.5">
              <Send className="h-4 w-4" />
              שתף
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

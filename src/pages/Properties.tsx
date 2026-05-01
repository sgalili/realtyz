import { useMemo, useState } from 'react';
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
import { Send, BedDouble, Ruler, MapPin, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  MOCK_HOMELY_PROPERTIES,
  PROPERTY_TYPE_LABELS_HE,
  CITY_OPTIONS,
  type HomelyProperty,
  type PropertyType,
} from '@/lib/homelyMockProperties';
import { ShareWithProspectDialog } from '@/components/properties/ShareWithProspectDialog';
import ErrorBoundary from '@/components/ErrorBoundary';

const PRICE_MIN = 0;
const PRICE_MAX = 10_000_000;
const PRICE_STEP = 100_000;

function formatPrice(n: number) {
  return `₪${n.toLocaleString('he-IL')}`;
}

export default function Properties() {
  const [city, setCity] = useState<string>('כל הערים');
  const [propertyType, setPropertyType] = useState<PropertyType | 'all'>('all');
  const [rooms, setRooms] = useState<string>('any');
  const [priceRange, setPriceRange] = useState<[number, number]>([PRICE_MIN, PRICE_MAX]);
  const [areaMin, setAreaMin] = useState<string>('');

  const [shareTarget, setShareTarget] = useState<HomelyProperty | null>(null);

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
      if (city !== 'כל הערים' && p.city !== city) return false;
      if (propertyType !== 'all' && p.property_type !== propertyType) return false;
      if (rooms !== 'any' && p.rooms < Number(rooms)) return false;
      if (p.price < priceRange[0] || p.price > priceRange[1]) return false;
      if (areaMin && p.size_sqm < Number(areaMin)) return false;
      return true;
    });
  }, [merged, city, propertyType, rooms, priceRange, areaMin]);

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6" dir="rtl">
      {/* Hero header — matches Finance / Deal Room styling */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">
            נכסים
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            קטלוג הנכסים מ-Homely. סננו לפי תקציב, אזור, סוג נכס וחדרים — ושלחו ישירות למועמדים.
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {filtered.length} נכסים
        </Badge>
      </header>

      {/* Filter bar */}
      <Card className="p-4 sm:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Price range */}
          <div className="space-y-2 lg:col-span-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">טווח מחירים</Label>
              <span className="text-xs text-muted-foreground">
                {formatPrice(priceRange[0])} – {formatPrice(priceRange[1])}
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
                {CITY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
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
                setCity('כל הערים');
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

      <ShareWithProspectDialog
        property={shareTarget}
        open={!!shareTarget}
        onOpenChange={(open) => { if (!open) setShareTarget(null); }}
      />
    </div>
  );
}

function PropertyCard({ property, onShare }: { property: HomelyProperty; onShare: () => void }) {
  const photo = property.photos[0];
  return (
    <Card className="overflow-hidden flex flex-col group">
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
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <h3 className="font-semibold text-base leading-tight line-clamp-2">{property.title}</h3>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{property.description}</p>
        </div>

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

        <div className="flex items-center justify-between mt-auto pt-2 border-t">
          <div className="text-lg font-bold text-success inline-flex items-center gap-1">
            <Building2 className="h-4 w-4 opacity-60" />
            {formatPrice(property.price)}
          </div>
          <Button size="sm" onClick={onShare} className="gap-1.5">
            <Send className="h-4 w-4" />
            שתף עם מועמד
          </Button>
        </div>
      </div>
    </Card>
  );
}

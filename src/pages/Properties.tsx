import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Send, BedDouble, Ruler, MapPin, Building2, FileSpreadsheet, LayoutGrid, SlidersHorizontal, Trash2, Pencil, Sparkles, Sun, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { AddPropertyDialog } from '@/components/properties/AddPropertyDialog';
import { EditPropertyDialog } from '@/components/properties/EditPropertyDialog';
import { ImportPropertiesDialog } from '@/components/properties/ImportPropertiesDialog';
import { HomelyBulkSyncDialog } from '@/components/properties/HomelyBulkSyncDialog';
import {
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
import { SortableTh, useTableSort, sortRows } from '@/components/ui/sortable-th';
import { normalizeImageUrls } from '@/lib/imageHealth';

const PRICE_MIN = 0;
const PRICE_MAX = 10_000_000;
const PRICE_STEP = 100_000;
const DEBUG_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '(missing)';
const DEBUG_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '(missing)';

function formatPrice(n: number) {
  return `₪${n.toLocaleString('he-IL')}`;
}

function detectPropertyType(title: string): PropertyType {
  if (/דופלקס/i.test(title)) return 'duplex';
  if (/פנט|פנטהאוז/i.test(title)) return 'penthouse';
  if (/בית|קוטג/i.test(title)) return 'house';
  if (/גן/i.test(title)) return 'garden_apt';
  return 'apartment';
}

function textBool(value: unknown): boolean | null {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim();
  if (/^(1|true|yes|כן|יש|y)$/i.test(s)) return true;
  if (/^(0|false|no|לא|אין|n)$/i.test(s)) return false;
  const n = Number(s.replace(/[^\d.-]/g, ''));
  if (Number.isFinite(n)) return n > 0;
  return null;
}

function extractBalcony(features: unknown, meta: Record<string, any>): boolean | null {
  const direct = textBool(meta.balcony ?? meta.mirpeset ?? meta.homely_raw?.mirpesetShemeshYN ?? meta.homely_raw?.balcony);
  if (direct !== null) return direct;
  if (Array.isArray(features) && features.some((f) => typeof f === 'string' && /מרפסת|balcony/i.test(f))) return true;
  return null;
}

function extractListingType(features: unknown, meta?: Record<string, any>, price?: number): ListingType {
  const raw = String(meta?.transaction_type ?? meta?.listing_type ?? meta?.deal_type ?? meta?.homely_raw?.transaction_type ?? '').toLowerCase();
  if (/rent|השכרה|שכירות|להשכרה/.test(raw)) return 'rent';
  if (/sale|מכירה|למכירה/.test(raw)) return 'sale';
  if (Array.isArray(features)) {
    const typed = features.find((f) => typeof f === 'object' && f && 'listing_type' in f) as { listing_type?: ListingType } | undefined;
    if (typed?.listing_type === 'rent' || typed?.listing_type === 'sale') return typed.listing_type;
  }
  if (price && price > 0 && price < 50_000) return 'rent';
  return 'sale';
}

function propertyDedupeKey(property: Partial<HomelyProperty> & { address?: string }) {
  return [property.address, property.city, property.title, property.rooms, property.price]
    .map((value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase())
    .join('|');
}

function dedupeProperties<T extends Partial<HomelyProperty> & { address?: string }>(properties: T[]): T[] {
  const seen = new Set<string>();
  return properties.filter((property) => {
    const key = propertyDedupeKey(property);
    if (!key.replace(/\|/g, '')) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type SourceTab = 'all' | 'mine' | 'homely' | 'yad2' | 'madlan';
const SOURCE_LABELS: Record<SourceTab, string> = {
  all: 'הכל',
  mine: 'הנכסים שלי',
  homely: 'הומלי',
  yad2: 'יד-2',
  madlan: 'מדל״ן',
};

function ConnectionStateDebugDashboard({
  cacheAuditReady,
  renderedListingsLength,
  filteredListingsLength,
}: {
  cacheAuditReady: boolean;
  renderedListingsLength: number;
  filteredListingsLength: number;
}) {
  const [rawCount, setRawCount] = useState<number | null>(null);
  const [rawCountError, setRawCountError] = useState<string | null>(null);

  useEffect(() => {
    if (!cacheAuditReady) return;

    let cancelled = false;

    const runRawCount = async () => {
      setRawCount(null);
      setRawCountError(null);
      const { count, error } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true });

      console.log('[Connection & State Audit] Raw listings count:', { count, error });

      if (cancelled) return;
      if (error) {
        setRawCountError(error.message);
        return;
      }
      setRawCount(count ?? 0);
    };

    void runRawCount();

    return () => {
      cancelled = true;
    };
  }, [cacheAuditReady]);

  return (
    <Card className="border-destructive/40 bg-destructive/5 p-4 text-left" dir="ltr">
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-2">
        <h2 className="text-sm font-bold text-destructive">Connection & State Audit</h2>
        <Badge variant={cacheAuditReady ? 'default' : 'secondary'}>
          {cacheAuditReady ? 'Cache cleared + live fetch forced' : 'Clearing TanStack cache'}
        </Badge>
      </div>
      <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-2">
          <dt className="font-semibold text-muted-foreground">supabaseUrl</dt>
          <dd className="break-all font-mono text-foreground">{DEBUG_SUPABASE_URL}</dd>
        </div>
        <div className="rounded-md border border-border bg-card p-2">
          <dt className="font-semibold text-muted-foreground">supabaseAnonKey</dt>
          <dd className="break-all font-mono text-foreground">{DEBUG_SUPABASE_ANON_KEY}</dd>
        </div>
        <div className="rounded-md border border-border bg-card p-2">
          <dt className="font-semibold text-muted-foreground">raw listings count</dt>
          <dd className="font-mono text-foreground">{rawCountError ? `ERROR: ${rawCountError}` : rawCount ?? 'loading...'}</dd>
        </div>
        <div className="rounded-md border border-border bg-card p-2">
          <dt className="font-semibold text-muted-foreground">useQuery listings length</dt>
          <dd className="font-mono text-foreground">{renderedListingsLength}</dd>
        </div>
        <div className="rounded-md border border-border bg-card p-2 sm:col-span-2">
          <dt className="font-semibold text-muted-foreground">visible after UI filters</dt>
          <dd className="font-mono text-foreground">{filteredListingsLength}</dd>
        </div>
      </dl>
    </Card>
  );
}


export default function Properties() {
  const { serviceAreas, coveredCities, isConfigured } = useServiceAreas();
  const [sourceTab, setSourceTab] = useState<SourceTab>('all');
  const [listingType, setListingType] = useState<ListingType | 'all'>('all');
  const [city, setCity] = useState<string>('כל הערים');
  const [propertyType, setPropertyType] = useState<PropertyType | 'all'>('all');
  const [rooms, setRooms] = useState<string>('any');
  // Single max-price slider — default at the maximum so users see ALL listings.
  const [maxPrice, setMaxPrice] = useState<number>(PRICE_MAX);
  const priceRange: [number, number] = [PRICE_MIN, maxPrice];
  const [areaMin, setAreaMin] = useState<string>('');
  // View mode for the property catalog — default to table per product spec.
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [shareTarget, setShareTarget] = useState<HomelyProperty | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [quickLinkUrl, setQuickLinkUrl] = useState('');
  const [quickLinkSeed, setQuickLinkSeed] = useState<string | null>(null);
  const [yad2Url, setYad2Url] = useState('');
  const [yad2Scraping, setYad2Scraping] = useState(false);
  const [yad2Result, setYad2Result] = useState<{ scanned?: number; scraped?: number; saved?: number; message?: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [homelyBulkOpen, setHomelyBulkOpen] = useState(false);
  const queryClient = useQueryClient();
  const [cacheAuditReady, setCacheAuditReady] = useState(false);
  const refreshListings = () => {
    setSourceTab('all');
    queryClient.removeQueries({ queryKey: ['properties-search'] });
    queryClient.invalidateQueries({ queryKey: ['properties-search'] });
  };


  useEffect(() => {
    queryClient.clear();
    setCacheAuditReady(true);
    console.log('[Connection & State Audit] TanStack Query cache cleared before listings fetch');
  }, [queryClient]);


  // Listen for hero-emitted add events (the '+' button lives in PageHero now).
  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<{ action: 'manual' | 'import' | 'homely' }>).detail?.action;
      if (action === 'manual') setAddOpen(true);
      else if (action === 'import') setImportOpen(true);
      else if (action === 'homely') setHomelyBulkOpen(true);
    };
    window.addEventListener('properties:add', handler);
    return () => window.removeEventListener('properties:add', handler);
  }, []);

  const fnName = sourceTab === 'yad2'
    ? 'yad2-search'
    : sourceTab === 'madlan'
    ? 'madlan-search'
    : 'homely-search';


  const { data: liveResponse, isLoading } = useQuery({
    queryKey: ['properties-search', sourceTab, { city, rooms, propertyType, priceRange, areaMin }],
    queryFn: async () => {
      try {
        {
          const rows: any[] = [];
          const pageSize = 1000;
          for (let from = 0; ; from += pageSize) {
            let query = supabase
              .from('listings')
              .select('id, external_id, property_title, description, asking_price, city, address, neighborhood, rooms, sqm, floor, features, source_metadata, source, source_url, media_photos, created_at, updated_at')
              .eq('status', 'live')
              .eq('is_published', true)
              .order('created_at', { ascending: false })
              .range(from, from + pageSize - 1);
            if (sourceTab === 'homely') query = query.eq('source', 'homely');
            else if (sourceTab === 'yad2') query = query.eq('source', 'yad2');
            else if (sourceTab === 'madlan') query = query.eq('source', 'madlan');
            const { data, error } = await query;
            if (error) throw error;
            rows.push(...(data ?? []));
            if ((data ?? []).length < pageSize) break;
          }
          // For "mine": strictly exclude any record whose source is
          // 'homely' or 'webtiv', and additionally drop any local row
          // that collides on dedupe key OR shares the same address/city
          // with an imported Homely/Webtiv property.
          let scoped = rows;
          if (sourceTab === 'mine') {
            const externalKeys = new Set<string>();
            const externalAddrKeys = new Set<string>();
            const normAddr = (r: any) =>
              `${(r.address ?? r.neighborhood ?? '').toString().trim().toLowerCase()}|${(r.city ?? '').toString().trim().toLowerCase()}`;
            for (const r of rows) {
              if (r.source !== 'homely' && r.source !== 'webtiv') continue;
              externalKeys.add(propertyDedupeKey({
                address: r.address ?? r.neighborhood ?? '',
                city: r.city ?? '',
                title: r.property_title ?? '',
                rooms: Number(r.rooms ?? 0),
                price: Number(r.asking_price ?? 0),
              }));
              const addrKey = normAddr(r);
              if (addrKey !== '|') externalAddrKeys.add(addrKey);
            }
            scoped = rows.filter((r) => {
              if (r.source === 'homely' || r.source === 'webtiv') return false;
              const k = propertyDedupeKey({
                address: r.address ?? r.neighborhood ?? '',
                city: r.city ?? '',
                title: r.property_title ?? '',
                rooms: Number(r.rooms ?? 0),
                price: Number(r.asking_price ?? 0),
              });
              if (externalKeys.has(k)) return false;
              const addrKey = normAddr(r);
              if (addrKey !== '|' && externalAddrKeys.has(addrKey)) return false;
              return true;
            });
          } else if (sourceTab === 'homely') {
            scoped = rows.filter((r) => r.source === 'homely' || r.source === 'webtiv');
          }

          console.log('[Connection & State Audit] Raw listings rows fetched for Properties.tsx:', {
            sourceTab,
            rowsLength: rows.length,
            scopedLength: scoped.length,
            ids: scoped.map((r: any) => ({
              id: r.id,
              source: r.source,
              external_id: r.external_id,
              media_photos_count: Array.isArray(r.media_photos) ? r.media_photos.length : 0,
            })),
          });

          return {
            connected: true,
            results: dedupeProperties(scoped.map((row: any) => {
              const meta = row.source_metadata && typeof row.source_metadata === 'object' ? row.source_metadata : {};
              const mediaPhotos = normalizeImageUrls(
                Array.isArray(row.media_photos) ? row.media_photos.filter((p: any) => typeof p === 'string') : [],
              );
              const originRaw = String(meta.source_origin ?? '').toLowerCase();
              const sourceUrlRaw = String(row.source_url ?? meta.source_url ?? '').toLowerCase();
              const originSource = /yad2\.co\.il/.test(sourceUrlRaw) ? 'yad2' : originRaw && originRaw !== 'homely' && originRaw !== 'webtiv' && originRaw !== 'manual'
                ? originRaw
                : (row.source === 'homely' || row.source === 'webtiv' ? 'homely' : row.source === 'yad2' ? 'yad2' : row.source === 'madlan' ? 'madlan' : 'mine');
              const sourceUpdated = typeof meta.source_updated_at === 'string' ? meta.source_updated_at : null;
              const rowFeatures = Array.isArray(row.features) ? row.features.filter((f: any) => typeof f === 'string') : [];
              const balcony = extractBalcony(row.features, meta as Record<string, any>);
              const features = Array.from(new Set([...rowFeatures, ...(balcony === true ? ['מרפסת'] : [])]));
              return {
                id: row.id,
                source: originSource as any,
                title: row.property_title || 'נכס',
                description: row.description || '',
                price: Number(row.asking_price ?? 0),
                currency: '₪',
                city: row.city ?? '',
                address: row.address ?? row.neighborhood ?? '',
                rooms: Number(row.rooms ?? 0),
                size_sqm: Number(row.sqm ?? 0),
                floor: row.floor != null ? Number(row.floor) : (meta.floor != null ? Number(meta.floor) : undefined),
                property_type: detectPropertyType(`${row.property_title ?? ''} ${row.description ?? ''}`),
                photos: mediaPhotos,
                url: row.source_url ?? meta.source_url ?? null,
                features,
                listing_type: extractListingType(row.features, meta as Record<string, any>, Number(row.asking_price ?? 0)),
                balcony,
                extras: (meta.extras ?? {}) as Record<string, string>,
                created_at: row.created_at ?? null,
                updated_at: sourceUpdated ?? row.updated_at ?? null,
              };
            })),
          };
        }


        // (yad2/madlan now read from the listings table above, filtered by source.)
        return { connected: true, results: [] };
      } catch (error) {
        console.error('[Connection & State Audit] Properties listings fetch failed:', error);
        return { connected: false, results: [] };
      }
    },
    enabled: cacheAuditReady,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
  });

  const liveResults = liveResponse?.results ?? [];
  const externalConnected = liveResponse?.connected !== false;

  const cityOptions = useMemo(() => {
    const cities = new Set<string>(CITY_OPTIONS as readonly string[]);
    liveResults.forEach((result) => {
      if (typeof result.city === 'string' && result.city.trim()) cities.add(result.city.trim());
    });
    return Array.from(cities);
  }, [liveResults]);

  const merged = useMemo<HomelyProperty[]>(() => {
    const live = liveResults.map((r: any, i) => ({
      id: String(r.id ?? `live-${i}`),
      source: (r.source as HomelyProperty['source']) ?? sourceTab,
      title: r.title ?? '',
      description: r.description ?? '',
      price: Number(r.price ?? 0),
      currency: r.currency ?? '₪',
      city: r.city ?? '',
      address: r.address ?? '',
      rooms: Number(r.rooms ?? 0),
      size_sqm: Number(r.size_sqm ?? 0),
      floor: r.floor != null ? Number(r.floor) : undefined,
      property_type: (r.property_type ?? 'apartment') as PropertyType,
      photos: Array.isArray(r.photos) ? normalizeImageUrls(r.photos as string[]) : [],
      url: r.url ?? null,
      features: Array.isArray(r.features) ? r.features as string[] : [],
      listing_type: (r.listing_type ?? 'sale') as ListingType,
      balcony: (r as any).balcony ?? null,
      extras: (r.extras ?? {}) as Record<string, string>,
      created_at: (r as any).created_at ?? null,
      updated_at: (r as any).updated_at ?? null,
    }));
    return live as Array<HomelyProperty & { extras?: Record<string, string>; created_at?: string | null; updated_at?: string | null }>;
  }, [liveResults, sourceTab]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return merged.filter((p) => {
      const pType: ListingType = (p.listing_type ?? 'sale') as ListingType;
      if (listingType !== 'all' && pType !== listingType) return false;
      if (city === '__my_zones__') {
        if (isConfigured && !isInServiceArea(p.city ?? null, null, serviceAreas)) return false;
      } else if (city !== 'כל הערים' && p.city !== city) {
        return false;
      }
      if (propertyType !== 'all' && p.property_type !== propertyType) return false;
      if (rooms !== 'any' && p.rooms < Number(rooms)) return false;
      if (p.price < priceRange[0] || p.price > priceRange[1]) return false;
      if (areaMin && p.size_sqm < Number(areaMin)) return false;
      if (q) {
        const hay = [p.title, p.description, p.city, (p as any).address, ...(p.features || [])]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [merged, listingType, city, propertyType, rooms, priceRange, areaMin, isConfigured, serviceAreas, searchQuery]);

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden min-w-0" dir="rtl">
      <ConnectionStateDebugDashboard
        cacheAuditReady={cacheAuditReady}
        renderedListingsLength={liveResults.length}
        filteredListingsLength={filtered.length}
      />

      {/* Header — title only (the '+' button lives inside the global hero) */}
      <header className="text-right">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">
          נכסים
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          {isConfigured
            ? `קטלוג הנכסים באזורי ההתמחות שלך (${coveredCities.join(', ')}). סננו לפי תקציב, סוג ופרטים.`
            : 'קטלוג הנכסים. סננו לפי תקציב, אזור, סוג נכס וחדרים, ושלחו ישירות למתעניינים.'}
        </p>
      </header>

      {/* Listing type toggle — sits just 15px below the wave hero per spec */}
      <div className="flex justify-center" style={{ marginTop: '15px' }}>
        <div className="inline-flex items-center rounded-xl border border-primary/20 bg-card/40 p-1 backdrop-blur-md" dir="rtl">
          {(['all', 'sale', 'rent'] as Array<ListingType | 'all'>).map((t) => (
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
              {t === 'all' ? 'הכל' : LISTING_TYPE_LABELS_HE[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Source tabs: Mine / Homely / Yad2 / Madlan */}
      <div className="flex justify-center">
        <div className="inline-flex items-center rounded-xl border border-primary/20 bg-card/40 p-1 backdrop-blur-md flex-wrap gap-1" dir="rtl">
          {(Object.keys(SOURCE_LABELS) as SourceTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSourceTab(t)}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                sourceTab === t
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {SOURCE_LABELS[t]}
            </button>
          ))}



        </div>
      </div>

      {sourceTab === 'yad2' && (
        <div className="flex justify-center" dir="rtl">
          <div className="w-full max-w-2xl space-y-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <Input
                dir="ltr"
                placeholder="הדבק קישור חיפוש מיד-2 כאן..."
                value={yad2Url}
                onChange={(e) => setYad2Url(e.target.value)}
                className="flex-1 bg-background text-right"
                disabled={yad2Scraping}
              />
              <Button
                type="button"
                disabled={yad2Scraping}
                onClick={async () => {
                  setYad2Scraping(true);
                  setYad2Result(null);
                  try {
                    const body: Record<string, unknown> = {};
                    const url = yad2Url.trim();
                    if (url.length > 5) body.url = url;
                    const { data, error } = await supabase.functions.invoke('scrape-yad2', { body });
                    if (error) throw error;
                    const summary = {
                      scanned: (data as any)?.scanned ?? (data as any)?.total ?? undefined,
                      scraped: (data as any)?.scraped ?? (data as any)?.count ?? undefined,
                      saved: (data as any)?.saved ?? (data as any)?.inserted ?? undefined,
                      message: (data as any)?.message,
                    };
                    setYad2Result(summary);
                    toast.success(
                      `יד-2: נסרקו ${summary.scanned ?? '—'} · נשלפו ${summary.scraped ?? '—'} · נשמרו ${summary.saved ?? '—'}`,
                    );
                    queryClient.invalidateQueries({ queryKey: ['properties-search'] });
                  } catch (err: any) {
                    console.error('[Yad2 scrape] failed:', err);
                    toast.error('ייבוא מיד-2 נכשל: ' + (err?.message ?? 'שגיאה לא ידועה'));
                  } finally {
                    setYad2Scraping(false);
                  }
                }}
                className="gap-1.5 whitespace-nowrap"
              >
                {yad2Scraping ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    סורק...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    חפש וייבוא מיד-2
                  </>
                )}
              </Button>
            </div>
            {yad2Scraping && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                מבצע סריקה של יד-2 — עשוי לקחת כמה עשרות שניות...
              </div>
            )}
            {yad2Result && !yad2Scraping && (
              <div className="rounded-lg border border-primary/20 bg-background/60 p-3 text-sm">
                <div className="font-semibold mb-1">סיכום ייבוא מיד-2</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-xs text-muted-foreground">נסרקו</div>
                    <div className="font-bold">{yad2Result.scanned ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">נשלפו</div>
                    <div className="font-bold">{yad2Result.scraped ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">נשמרו</div>
                    <div className="font-bold text-primary">{yad2Result.saved ?? '—'}</div>
                  </div>
                </div>
                {yad2Result.message && (
                  <div className="mt-2 text-xs text-muted-foreground text-center">{yad2Result.message}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {sourceTab === 'madlan' && (
        <div className="flex justify-center" dir="rtl">
          <div className="flex w-full max-w-2xl items-center gap-2 rounded-xl border-2 border-primary/30 bg-primary/5 p-2">
            <Input
              dir="ltr"
              placeholder="הוספה מהירה באמצעות קישור (Link) — הדבק כאן URL ממדל״ן"
              value={quickLinkUrl}
              onChange={(e) => setQuickLinkUrl(e.target.value)}
              className="flex-1 bg-background text-right"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && quickLinkUrl.trim().length > 5) {
                  setQuickLinkSeed(quickLinkUrl.trim());
                  setAddOpen(true);
                  setQuickLinkUrl('');
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              disabled={quickLinkUrl.trim().length < 5}
              onClick={() => {
                setQuickLinkSeed(quickLinkUrl.trim());
                setAddOpen(true);
                setQuickLinkUrl('');
              }}
              className="gap-1.5 whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" />
              משוך נכס
            </Button>
          </div>
        </div>
      )}

      {/* Count + view mode + search (with inline filter) — centered row */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <div className="flex items-center justify-center gap-2 flex-wrap" dir="rtl">
          <Badge variant="secondary" className="text-sm">
            {filtered.length} נכסים
          </Badge>
          <div className="inline-flex rounded-md border border-border bg-card/50 p-0.5" role="group" aria-label="מצב תצוגה">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-sm transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              title="תצוגת כרטיסיות"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> כרטיסיות
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-pressed={viewMode === 'table'}
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-sm transition-colors ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              title="תצוגת טבלה — כל העמודות מהקובץ"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> טבלה
            </button>
          </div>
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש לפי כתובת, עיר, כותרת..."
              className="h-8 text-right pr-3 pl-9"
              dir="rtl"
            />
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="absolute left-1 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="סינון"
                title="סינון"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </CollapsibleTrigger>
          </div>
        </div>


        <CollapsibleContent>
          <Card className="p-4 sm:p-5 mt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Max price */}
              <div className="space-y-2 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">מחיר מקסימלי</Label>
                  <span className="text-xs text-muted-foreground">
                    עד {formatPrice(maxPrice)}
                  </span>
                </div>
                <Slider
                  dir="rtl"
                  min={PRICE_MIN}
                  max={PRICE_MAX}
                  step={PRICE_STEP}
                  value={[maxPrice]}
                  onValueChange={(v) => setMaxPrice(v[0] ?? PRICE_MAX)}
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
                      cityOptions.map((c) => (
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
                    setCity('כל הערים');
                    setPropertyType('all');
                    setRooms('any');
                    setMaxPrice(PRICE_MAX);
                    setAreaMin('');
                    toast.success('הסינון אופס');
                  }}
                >
                  איפוס סינון
                </Button>
              </div>
            </div>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* (count moved into the view-mode row above) */}

      {/* Grid / Table */}
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
        ) : viewMode === 'table' ? (
          <PropertyTable properties={filtered as any} />
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

      <AddPropertyDialog
        open={addOpen}
        onOpenChange={(o) => { setAddOpen(o); if (!o) setQuickLinkSeed(null); }}
        onCreated={refreshListings}
        initialText={quickLinkSeed ?? undefined}
        autoHydrate={!!quickLinkSeed}
        defaultSource={sourceTab === 'yad2' ? 'yad2' : sourceTab === 'madlan' ? 'madlan' : 'manual'}
      />
      <ImportPropertiesDialog open={importOpen} onOpenChange={setImportOpen} onImported={refreshListings} />
      <HomelyBulkSyncDialog open={homelyBulkOpen} onOpenChange={setHomelyBulkOpen} onImported={refreshListings} mode="properties" />
    </div>
  );
}

function PropertyCard({ property, onShare }: { property: HomelyProperty; onShare: () => void }) {
  // Hard-override: thumbnail comes strictly from listing.media_photos[0].
  // No live-image fallback, no placeholder filtering — trust the DB array.
  const mediaPhotos = Array.isArray(property.photos)
    ? property.photos.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    : [];
  const photoCount = mediaPhotos.length;
  const photo = mediaPhotos[0];
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
          {photoCount > 0 && (
            <span className="absolute bottom-2 left-2 rounded border bg-background/90 px-1.5 py-0.5 text-xs font-semibold leading-none text-foreground tabular-nums">
              {photoCount}
            </span>
          )}
          <Badge className="absolute top-3 right-3 bg-background/90 text-foreground border">
            {PROPERTY_TYPE_LABELS_HE[property.property_type]}
          </Badge>
          {property.listing_type && (
            <Badge className={`absolute top-3 left-3 border ${isRent ? 'bg-[#0b3982] text-white border-[#0b3982]' : 'bg-primary text-primary-foreground'}`}>
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
          {(property as any).balcony === true ? (
            <span className="inline-flex items-center gap-1">
              <Sun className="h-3.5 w-3.5" /> מרפסת
            </span>
          ) : null}
        </div>

        <div className="flex items-center justify-between mt-auto pt-2 border-t gap-2 flex-wrap">
          <div className="text-lg font-bold text-success inline-flex items-center gap-1">
            <Building2 className="h-4 w-4 opacity-60" />
            {property.price > 0
              ? (<>{formatPrice(property.price)}{isRent ? <span className="text-xs font-normal text-muted-foreground">/חודש</span> : null}</>)
              : (<span className="text-sm font-semibold text-amber-600">פרטים חסרים</span>)}
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

// Full table view — shows every column that was uploaded for each property,
// plus a Share action per row (merged from the former list view).
function PropertyTable({ properties }: { properties: Array<HomelyProperty & { extras?: Record<string, string>; created_at?: string | null }> }) {
  const [shareTarget, setShareTarget] = useState<HomelyProperty | null>(null);
  const [editTarget, setEditTarget] = useState<HomelyProperty | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HomelyProperty | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const queryClient = useQueryClient();
  type SortKey = 'created_at' | 'updated_at' | 'listing_type' | 'title' | 'price' | 'city' | 'address' | 'rooms' | 'floor' | 'size_sqm' | 'property_type' | 'balcony';
  const { sort, toggle } = useTableSort<SortKey>({ key: 'updated_at', dir: 'desc' });
  const sorted = useMemo(() => sortRows(properties, sort, (row, key) => {
    switch (key) {
      case 'created_at': return row.created_at ? new Date(row.created_at) : null;
      case 'updated_at': return (row as any).updated_at ? new Date((row as any).updated_at) : (row.created_at ? new Date(row.created_at) : null);
      case 'listing_type': return LISTING_TYPE_LABELS_HE[row.listing_type ?? 'sale'];
      case 'title': return row.title;
      case 'price': return Number(row.price ?? 0);
      case 'city': return row.city ?? '';
      case 'address': return row.address ?? '';
      case 'rooms': return Number(row.rooms ?? 0);
      case 'floor': return Number(row.floor ?? 0);
      case 'size_sqm': return Number(row.size_sqm ?? 0);
      case 'property_type': return row.property_type ?? '';
      case 'balcony': return (row as any).balcony === true ? 1 : 0;
      default: return '';
    }
  }), [properties, sort]);

  // Bulk-delete applies to every loaded property — local DB only, never round-trips to Homely.
  const allFilteredSelected = sorted.length > 0 && sorted.every((p) => selectedIds.has(p.id));
  const someSelected = sorted.some((p) => selectedIds.has(p.id));

  const toggleAll = () => {
    if (allFilteredSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(sorted.map((p) => p.id)));
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('listings').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast.error('מחיקת הנכס נכשלה: ' + error.message);
      return;
    }
    toast.success('הנכס נמחק');
    setDeleteTarget(null);
    queryClient.invalidateQueries({ queryKey: ['properties-search'] });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    // Chunk to keep the URL/`in(...)` list within PostgREST limits on large selections.
    const CHUNK = 200;
    let removed = 0;
    let firstError: string | null = null;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from('listings')
        .delete()
        .in('id', slice)
        .select('id');
      if (error) { firstError = error.message; break; }
      removed += data?.length ?? 0;
    }
    setBulkDeleting(false);
    if (firstError) {
      toast.error('מחיקה מרובה נכשלה: ' + firstError);
      return;
    }
    if (removed === 0) {
      toast.error('לא ניתן למחוק את הנכסים שנבחרו (אין הרשאה)');
      return;
    }
    if (removed < ids.length) {
      toast.success(`${removed} מתוך ${ids.length} נכסים נמחקו (שאר הרשומות חסומות בהרשאות)`);
    } else {
      toast.success(`${removed} נכסים נמחקו`);
    }
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
    queryClient.invalidateQueries({ queryKey: ['properties-search'] });
  };

  return (
    <>
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2" dir="rtl">
          <div className="text-xs font-medium">
            {selectedIds.size.toLocaleString('he-IL')} נכסים נבחרו
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
              נקה בחירה
            </Button>
            <Button size="sm" variant="destructive" className="h-7 text-xs gap-1.5" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" /> מחק נבחרים
            </Button>
          </div>
        </div>
      )}
      <Card className="overflow-x-auto max-w-full w-full">
        <table className="w-full text-[15px]" dir="rtl">
          <thead className="bg-muted/50 sticky top-0">
            <tr className="text-right">
              <th className="px-2 py-2 w-8">
                <Checkbox
                  checked={allFilteredSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={toggleAll}
                  disabled={sorted.length === 0}
                  aria-label="בחר הכל"
                />
              </th>
              <SortableTh sortKey="title" sort={sort} onSort={toggle} className="px-2 py-2 font-semibold whitespace-nowrap">שם מלא</SortableTh>
              <SortableTh sortKey="listing_type" sort={sort} onSort={toggle} className="px-2 py-2 font-semibold whitespace-nowrap">סוג עסקה</SortableTh>
              <SortableTh sortKey="price" sort={sort} onSort={toggle} className="px-2 py-2 font-semibold whitespace-nowrap">מחיר</SortableTh>
              <SortableTh sortKey="city" sort={sort} onSort={toggle} className="px-2 py-2 font-semibold whitespace-nowrap">עיר</SortableTh>
              <SortableTh sortKey="address" sort={sort} onSort={toggle} className="px-2 py-2 font-semibold whitespace-nowrap">רחוב</SortableTh>
              <SortableTh sortKey="rooms" sort={sort} onSort={toggle} className="px-2 py-2 font-semibold whitespace-nowrap">חדרים</SortableTh>
              <SortableTh sortKey="floor" sort={sort} onSort={toggle} className="px-2 py-2 font-semibold whitespace-nowrap">קומה</SortableTh>
              <SortableTh sortKey="size_sqm" sort={sort} onSort={toggle} className="px-2 py-2 font-semibold whitespace-nowrap">מ"ר</SortableTh>
              <SortableTh sortKey="balcony" sort={sort} onSort={toggle} className="px-2 py-2 font-semibold whitespace-nowrap">מרפסת</SortableTh>
              <SortableTh sortKey="property_type" sort={sort} onSort={toggle} className="px-2 py-2 font-semibold whitespace-nowrap">סוג נכס</SortableTh>
              <SortableTh sortKey="updated_at" sort={sort} onSort={toggle} className="px-2 py-2 font-semibold whitespace-nowrap">עודכן</SortableTh>
              <th className="px-2 py-2 font-semibold whitespace-nowrap">מקור</th>
              <th className="px-2 py-2 font-semibold whitespace-nowrap text-left">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const isRent = p.listing_type === 'rent';
              const isMine = p.source === 'mine';
              const sourceUrl: string | null = (p as any).url ?? null;
              const sourceLabel: string =
                p.source === 'yad2' ? 'yad2'
                : p.source === 'madlan' ? 'madlan'
                : (p.source as string) === 'fomo' ? 'fomo'
                : (p.source as string) === 'facebook' ? 'facebook'
                : (p.source as string) === 'winwin' ? 'winwin'
                : (p.source as string) === 'homely' ? 'homely'
                : (p.source as string) || 'הזנה ידנית';
              return (
                <tr key={p.id} className={`border-t hover:bg-muted/30 ${selectedIds.has(p.id) ? 'bg-destructive/5' : ''}`}>
                  <td className="px-2 py-1.5 w-8">
                    <Checkbox
                      checked={selectedIds.has(p.id)}
                      onCheckedChange={() => toggleOne(p.id)}
                      aria-label="בחר נכס"
                    />
                  </td>
                  <td className="px-2 py-1.5 max-w-[220px] truncate">
                    <Link to={`/properties/${p.id}`} className="hover:underline">{p.title}</Link>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className={`text-xs font-bold ${isRent ? 'text-[#f59e0b]' : 'text-success'}`}>
                      {LISTING_TYPE_LABELS_HE[p.listing_type ?? 'sale']}
                    </span>
                  </td>

                  <td className={`px-2 py-1.5 whitespace-nowrap font-semibold ${isRent ? 'text-[#f59e0b]' : 'text-success'}`}>
                    {p.price ? formatPrice(p.price) : '—'}{isRent && p.price ? <span className="text-[12px] text-muted-foreground">/ח</span> : null}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{p.city || '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap max-w-[180px] truncate" title={p.address || ''}>{p.address || '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{p.rooms || '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{p.floor ?? '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{p.size_sqm || '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{(p as any).balcony === true ? 'כן' : (p as any).balcony === false ? 'לא' : '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{PROPERTY_TYPE_LABELS_HE[p.property_type] || '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">{(p as any).updated_at ? new Date((p as any).updated_at).toLocaleDateString('he-IL') : (p.created_at ? new Date(p.created_at).toLocaleDateString('he-IL') : '—')}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {sourceUrl ? (
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-xs font-semibold"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {sourceLabel}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">{sourceLabel}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-left">
                    <div className="inline-flex items-center gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setShareTarget(p)} className="gap-1.5">
                        <Send className="h-3.5 w-3.5" /> שתף
                      </Button>
                      {isMine && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditTarget(p)}
                          className="gap-1.5"
                          title="ערוך נכס"
                          aria-label="ערוך נכס"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(p)}
                        className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="מחק נכס"
                        aria-label="מחק נכס"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <ShareWithLeadDialog
        property={shareTarget}
        open={!!shareTarget}
        onOpenChange={(open) => { if (!open) setShareTarget(null); }}
      />
      <EditPropertyDialog
        property={editTarget}
        open={!!editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['properties-search'] })}
      />
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את הנכס?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.title ? `"${deleteTarget.title}" ` : ''}יימחק לצמיתות. לא ניתן לבטל פעולה זו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'מוחק…' : 'מחק'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={bulkDeleteOpen} onOpenChange={(open) => { if (!bulkDeleting) setBulkDeleteOpen(open); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק {selectedIds.size} נכסים?</AlertDialogTitle>
            <AlertDialogDescription>
              הנכסים שנבחרו יימחקו לצמיתות. לא ניתן לבטל פעולה זו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>ביטול</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkDeleting}
              onClick={(e) => { e.preventDefault(); handleBulkDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting ? 'מוחק…' : `מחק ${selectedIds.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { Fragment, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem,
  DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Megaphone, BedDouble, Ruler, MapPin, Building2, FileSpreadsheet, LayoutGrid,
  SlidersHorizontal, ArrowRight, Loader2, Search as SearchIcon, Filter,
  ArrowUpDown, Database, ChevronLeft, ChevronRight, X, ChevronUp, Images as ImageIcon,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { VoiceInputButton } from '@/components/voice/VoiceInputButton';
import { AddPropertyDialog } from '@/components/properties/AddPropertyDialog';
import { ManualPropertyDialog } from '@/components/properties/ManualPropertyDialog';
import { ImportPropertiesDialog } from '@/components/properties/ImportPropertiesDialog';
import { HomelyBulkSyncDialog } from '@/components/properties/HomelyBulkSyncDialog';
import {
  PROPERTY_TYPE_LABELS_HE, CITY_OPTIONS, LISTING_TYPE_LABELS_HE,
  type PropertyType, type ListingType,
} from '@/lib/homelyMockProperties';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useServiceAreas } from '@/hooks/useServiceAreas';
import { useAuth } from '@/hooks/useAuth';
import { SourceBadge, sourceLabel, type PropertySource } from '@/components/properties/SourceBadge';
import { PropertyNotesBlock } from '@/components/properties/PropertyNotesBlock';
import { usePropertyNotesByListing } from '@/hooks/usePropertyNotes';
import { searchAllSources, searchLocalListings, type UnifiedResult, type SearchFilters } from '@/lib/propertySearch';
import { autoImportResult } from '@/lib/propertyAutoImport';
import { sourcePhotoCount } from '@/lib/photoCount';
import { stripAddressNumbers } from '@/lib/formatAddress';
import { formatListingTitle, formatInternalListingTitle, formatStreetTypeTitle } from '@/lib/formatListingTitle';
import { houseNumberOf, apartmentNumberOf } from '@/lib/addressNumbers';
import { ensureFullPropertyImport, ensureMetadataImport } from '@/lib/propertyFullSync';
import { isNewListing, isOldListing } from '@/lib/listingFreshness';
import { isRelevantListing } from '@/lib/listingRelevance';
import { sourceYad2Url } from '@/lib/yad2Ad';
import { Yad2Icon } from '@/components/properties/Yad2Icon';
import { useYad2AdStatus } from '@/hooks/useYad2AdStatus';
import { formatListingDate, listingActivityAt } from '@/lib/listingDates';
import { ListingDateCell } from '@/components/properties/ListingDateCell';
import { listingPublishedAt } from '@/lib/listingFreshness';



import { ImportProgressDialog, type ImportStep } from '@/components/properties/ImportProgressDialog';
import { PropertyPreviewDialog } from '@/components/properties/PropertyPreviewDialog';
import { PropertyShareMenu } from '@/components/properties/PropertyShareMenu';


const PRICE_MIN = 0;
const PRICE_MAX = 10_000_000;
const PRICE_STEP = 100_000;
const CACHE_KEY = 'properties:last-search:v1';
// Home markets used for the default (never-empty) listing pool.
const DEFAULT_CITIES = ['הרצליה', 'רמת השרון'];
const DEFAULT_POOL_PER_TYPE = 100;


function formatPrice(n: number) {
  return `₪${n.toLocaleString('he-IL')}`;
}

type SourceInfo = { status: string; count: number; error?: string };

/**
 * Searches fan out per city, so every city returns its own per-source report.
 * Counts are SUMMED (not overwritten) and an error in one city doesn't erase
 * a successful count from another.
 */
function mergeSourceStatuses(reports: Array<Record<string, SourceInfo>>): Record<string, SourceInfo> {
  const out: Record<string, SourceInfo> = {};
  for (const report of reports) {
    for (const [key, info] of Object.entries(report ?? {})) {
      if (!info) continue;
      const prev = out[key];
      if (!prev) { out[key] = { ...info }; continue; }
      const count = (prev.count ?? 0) + (info.count ?? 0);
      const status =
        prev.status === 'ok' || info.status === 'ok' ? 'ok'
        : prev.status === 'error' || info.status === 'error' ? 'error'
        : info.status;
      out[key] = { status, count, error: prev.error ?? info.error };
    }
  }
  return out;
}

type SavedState = {
  q: string;
  listingType: ListingType | 'all';
  city: string;
  propertyType: PropertyType | 'all';
  rooms: string;
  maxPrice: number;
  areaMin: string;
  results?: UnifiedResult[];
  hasSearched?: boolean;
};


function loadCache(): SavedState | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveCache(s: SavedState) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export default function Properties() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { serviceAreas, coveredCities, isConfigured } = useServiceAreas();
  const { user } = useAuth();
  const cached = useMemo(() => loadCache(), []);

  const [q, setQ] = useState<string>(cached?.q ?? '');
  const [listingType, setListingType] = useState<ListingType | 'all'>(cached?.listingType ?? 'all');
  const [city, setCity] = useState<string>(cached?.city ?? 'כל הערים');
  const [propertyType, setPropertyType] = useState<PropertyType | 'all'>(cached?.propertyType ?? 'all');
  const [rooms, setRooms] = useState<string>(cached?.rooms ?? 'any');
  const [maxPrice, setMaxPrice] = useState<number>(cached?.maxPrice ?? PRICE_MAX);
  const [areaMin, setAreaMin] = useState<string>(cached?.areaMin ?? '');

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'price_asc' | 'price_desc' | 'rooms_desc' | 'size_desc' | 'newest'>('newest');

  const [results, setResults] = useState<UnifiedResult[]>(cached?.results ?? []);
  const [sourceStatus, setSourceStatus] = useState<Record<string, SourceInfo>>({});
  // Active source filter from the breakdown popup (null = all sources).
  const [sourceFilter, setSourceFilter] = useState<PropertySource | null>(null);
  const [searching, setSearching] = useState(false);
  const voiceSearchPendingRef = useRef(false);
  // Live streaming progress for the active search (sources answered / total).
  const [searchProgress, setSearchProgress] = useState<{ done: number; total: number; loaded: number; pending: string[] } | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(!!cached?.hasSearched || !!cached?.results?.length);
  // True when the current table is the default pool shown because the user's
  // own search returned nothing. The grid is never allowed to be empty.
  const [showingFallback, setShowingFallback] = useState(false);

  const [importingKey, setImportingKey] = useState<string | null>(null);

  // Multi-select + batch import progress
  const [importSteps, setImportSteps] = useState<ImportStep[]>([]);
  const [progressOpen, setProgressOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState<UnifiedResult | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [homelyBulkOpen, setHomelyBulkOpen] = useState(false);
  const [quickLinkSeed, setQuickLinkSeed] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<{ action: 'manual' | 'import' | 'homely' }>).detail?.action;
      if (action === 'manual') setManualOpen(true);
      else if (action === 'import') setImportOpen(true);
      else if (action === 'homely') setHomelyBulkOpen(true);
    };
    window.addEventListener('properties:add', handler);
    return () => window.removeEventListener('properties:add', handler);
  }, []);

  // LIVE SYNC — on entering the page we kick a throttled background refresh of
  // Homely + Yad2 inventory into our own `listings` table (max once every 30
  // minutes), then repaint from the DB. Never blocks the UI.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    const KEY = 'realtyz:properties:last-live-sync';
    const last = Number(localStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 30 * 60 * 1000) return;
    localStorage.setItem(KEY, String(Date.now()));
    void (async () => {
      await Promise.allSettled([
        supabase.functions.invoke('homely-daily-sync', { body: { reason: 'properties_page' } }),
        supabase.functions.invoke('properties-scheduled-sync', { body: { reason: 'properties_page' } }),
      ]);
      defaultPoolRef.current.clear();
      const pool = await loadDefaultPool(listingType).catch(() => [] as UnifiedResult[]);
      if (pool.length) setResults((cur) => (cur.length ? cur : pool));
      queryClient.invalidateQueries({ queryKey: ['properties-search'] });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // FIRST VISIT ONLY — the workspace has no inventory yet, so we pull the 50
  // newest Yad2 listings (sale + rent) for the agent's cities straight into our
  // own `listings` table. Runs once per user, in the background.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!user?.id || seededRef.current) return;
    const KEY = `realtyz:properties:yad2-first-seed:${user.id}`;
    if (localStorage.getItem(KEY) === '1') return;
    seededRef.current = true;
    localStorage.setItem(KEY, '1');
    const cities = (isConfigured && coveredCities.length ? coveredCities : DEFAULT_CITIES).slice(0, 2);
    const perCall = Math.max(10, Math.ceil(50 / (cities.length * 2)));
    void (async () => {
      const toastId = toast.loading('טוען את 50 הנכסים החדשים ביד2 לאזור שלך…');
      try {
        await Promise.allSettled(
          cities.flatMap((c) =>
            (['sale', 'rent'] as ListingType[]).map((t) =>
              supabase.functions.invoke('yad2-unlocker', {
                body: { city: c, listing_type: t, mode: 'search', limit: perCall, pages: 1 },
              }),
            ),
          ),
        );
        defaultPoolRef.current.clear();
        const pool = await loadDefaultPool(listingType).catch(() => [] as UnifiedResult[]);
        if (pool.length) setResults((cur) => (cur.length ? cur : pool));
        queryClient.invalidateQueries({ queryKey: ['properties-search'] });
        toast.success('הנכסים העדכניים מיד2 נשמרו במאגר שלך', { id: toastId });
      } catch {
        toast.dismiss(toastId);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isConfigured, coveredCities.join('|')]);


  // LOCAL-FIRST: entering the page never triggers a live scraper call.
  // The default pool is read straight from our own `listings` table
  // (100 newest for sale + 100 newest for rent across the workspace's home
  // markets), which keeps external API quota untouched. Fresh external
  // inventory arrives through the twice-daily background sync job.
  const defaultPoolRef = useRef<Map<string, UnifiedResult[]>>(new Map());
  const loadDefaultPool = useCallback(async (type: ListingType | 'all' = 'all'): Promise<UnifiedResult[]> => {
    const cacheKey = type;
    const hit = defaultPoolRef.current.get(cacheKey);
    if (hit) return hit;
    const cities = DEFAULT_CITIES;
    const batches = await Promise.all(
      cities.map((c) =>
        searchLocalListings({ city: c, listing_type: 'all' }).catch(() => [] as UnifiedResult[]),
      ),
    );
    const seen = new Set<string>();
    let all = batches.flat().filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));
    // Safety net: if the workspace cities hold nothing yet, show all stored inventory.
    if (!all.length) {
      all = await searchLocalListings({ listing_type: 'all' }).catch(() => [] as UnifiedResult[]);
    }
    const newestFirst = (a: UnifiedResult, b: UnifiedResult) =>
      new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    const take = (t: ListingType) => all.filter((r) => r.listing_type === t).sort(newestFirst).slice(0, DEFAULT_POOL_PER_TYPE);
    const pool =
      type === 'all'
        ? [...take('sale'), ...take('rent')].sort(newestFirst)
        : take(type);
    defaultPoolRef.current.set(cacheKey, pool);
    return pool;
  }, []);


  // The table is NEVER empty: whenever the query box is blank we repaint the
  // local pool for the active transaction toggle (all / rent / sale).
  useEffect(() => {
    if (q.trim()) return;
    let cancelled = false;
    (async () => {
      setSearching(true);
      try {
        const rows = await loadDefaultPool(listingType);
        if (cancelled) return;
        setResults(rows);
        setHasSearched(false);
        setShowingFallback(false);
        setSourceStatus({ mine: { status: rows.length ? 'ok' : 'empty', count: rows.length } });
      } catch (err) {
        console.error('[Properties] default pool preload failed', err);
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDefaultPool, listingType, q]);

  // INSTANT LOCAL FILTER — from the 3rd typed character we paint matching rows
  // straight out of our own `listings` table. Zero external calls, zero cost,
  // no waiting: external gateways only run when the user submits the search.
  const instantTokenRef = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) return;
    if (/^https?:\/\//i.test(term)) return; // URL paste → import flow
    const token = ++instantTokenRef.current;
    const timer = setTimeout(async () => {
      try {
        const rows = await searchLocalListings({
          q: term,
          listing_type: listingType === 'all' ? 'all' : listingType,
        });
        if (instantTokenRef.current !== token) return;
        if (!rows.length) return; // never blank the table
        setResults(rows);
        setShowingFallback(false);
        setSourceStatus({ mine: { status: 'ok', count: rows.length } as any });
      } catch (e) {
        console.warn('[Properties] instant local filter failed', e);
      }
    }, 180);
    return () => { clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, listingType]);


  // Monotonic token — bumping it aborts the in-flight search: late partials
  // and the final payload are ignored, so whatever was already painted stays.
  const searchTokenRef = useRef(0);

  const runSearch = useCallback(async () => {
    const token = ++searchTokenRef.current;
    setSearching(true);
    setSearchProgress({ done: 0, total: 3, loaded: 0, pending: ['mine', 'homely', 'yad2'] });

    setHasSearched(true);
    try {
      // Parse the free-text query into structured hints so external gateways
      // (Yad2, Homely, Webtiv) receive real filters instead of raw prose.
      const { parseSearchQuery, matchesAmenities } = await import('@/lib/parseSearchQuery');
      const parsed = parseSearchQuery(q);
      const explicitCity = city && city !== 'כל הערים' && city !== '__my_zones__' ? city : null;
      const effectiveCity = explicitCity ?? parsed.city;
      const effectiveRooms = rooms !== 'any' ? Number(rooms) : parsed.rooms;
      const effectiveListing: SearchFilters['listing_type'] =
        listingType !== 'all' ? listingType : (parsed.listing_type ?? 'all');
      const effectivePropertyType = propertyType !== 'all' ? propertyType : (parsed.property_type ?? 'all');
      const effectiveMaxPrice = maxPrice < PRICE_MAX ? maxPrice : (parsed.max_price ?? undefined);
      const effectiveMinPrice = parsed.min_price ?? undefined;
      const wantedAmenities = parsed.amenities;

      const filters: SearchFilters = {
        q: (parsed.keywords || q.trim()) || undefined,
        city: effectiveCity ?? undefined,
        neighborhood: parsed.neighborhood ?? undefined,
        min_price: effectiveMinPrice,
        max_price: effectiveMaxPrice,
        rooms: effectiveRooms ?? undefined,
        listing_type: effectiveListing,
        min_sqm: areaMin ? Number(areaMin) : undefined,
        property_type: effectivePropertyType !== 'all' ? effectivePropertyType : undefined,
      };
      const applyType = (rows: UnifiedResult[]) => {
        let out = effectivePropertyType !== 'all'
          ? rows.filter((r) => !r.property_type || String(r.property_type).toLowerCase() === effectivePropertyType)
          : rows;
        if (wantedAmenities.length) {
          const strict = out.filter((r) =>
            matchesAmenities(
              [r.title, r.description, r.address, r.neighborhood, JSON.stringify((r.raw as any)?.features ?? '')]
                .filter(Boolean).join(' '),
              wantedAmenities,
            ),
          );
          // Amenity data is patchy across sources — only narrow when it pays off.
          if (strict.length) out = strict;
        }
        return out;
      };

      // Searches are scoped to the workspace territory by default. Only when
      // the user explicitly types/picks another city do we leave the zone.
      const searchCities: string[] = effectiveCity ? [effectiveCity] : DEFAULT_CITIES;
      const perCity = new Map<string, UnifiedResult[]>();
      const perCityStatus = new Map<string, Record<string, SourceInfo>>();
      const paint = () => {
        const seen = new Set<string>();
        const merged: UnifiedResult[] = [];
        for (const rows of perCity.values()) {
          for (const r of rows) if (!seen.has(r.key)) { seen.add(r.key); merged.push(r); }
        }
        return applyType(merged);
      };

      // Each source streams into the table the moment it answers.
      const responses = await Promise.all(
        searchCities.map((c) =>
          searchAllSources({ ...filters, city: c }, (partial) => {
            if (searchTokenRef.current !== token) return;
            perCity.set(c, partial.results);
            perCityStatus.set(c, partial.sources as Record<string, SourceInfo>);
            const rows = paint();
            if (!rows.length) return; // never blank the table mid-stream
            setResults(rows);
            setShowingFallback(false);
            setSourceStatus(mergeSourceStatuses(Array.from(perCityStatus.values())));
            if (partial.progress) {
              setSearchProgress({ ...partial.progress, loaded: rows.length });
            }
          }).catch((e) => {
            console.error('[Properties] city search failed', c, e);
            return { results: [] as UnifiedResult[], sources: {} as any };
          }),
        ),
      );
      if (searchTokenRef.current !== token) return; // cancelled — keep partials
      searchCities.forEach((c, i) => perCity.set(c, responses[i].results));
      const respSources = mergeSourceStatuses(responses.map((r) => (r.sources ?? {}) as Record<string, SourceInfo>));
      const filtered = paint();
      if (filtered.length) {
        setResults(filtered);
        setShowingFallback(false);
        setSourceStatus(respSources);
      } else {
        // Zero-result guard: fall back to the default recent pool instead of
        // ever showing an empty table.
        const pool = await loadDefaultPool(listingType);
        if (searchTokenRef.current !== token) return;
        setResults(pool);
        setShowingFallback(true);
        setSourceStatus({ mine: { status: pool.length ? 'ok' : 'empty', count: pool.length } as any });
      }
      const errored = Object.entries(respSources).filter(([, v]: any) => v?.status === 'error');

      if (errored.length) {
        for (const [k, v] of errored) {
          toast.info(`${sourceLabel(k as any)}: לא זמין`, {
            description: (v as any)?.error ? String((v as any).error).slice(0, 220) : undefined,
          });
        }
      }


    } catch (err: any) {
      if (searchTokenRef.current !== token) return;
      console.error('[Properties] search failed', err);
      toast.error('חיפוש נכשל: ' + (err?.message ?? 'שגיאה לא ידועה'));
    } finally {
      if (searchTokenRef.current === token) {
        setSearching(false);
        setSearchProgress(null);
      }
    }
  }, [q, listingType, city, propertyType, rooms, maxPrice, areaMin, loadDefaultPool]);

  // Warm the textual content of the first visible rows in the background, so
  // opening a property card renders its full text instantly instead of
  // scraping on demand. Runs once per listing id, throttled to a few rows.
  const warmedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!results.length) return;
    const ids = results
      .slice(0, 8)
      .map((r) => ({ id: r.localId, url: r.url }))
      .filter((x): x is { id: string; url: string | null } => !!x.id && !warmedRef.current.has(x.id));
    if (!ids.length) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      for (const { id, url } of ids) {
        if (cancelled) break;
        warmedRef.current.add(id);
        void ensureMetadataImport(id, url).catch(() => {});
      }
    }, 400);
    return () => { cancelled = true; window.clearTimeout(handle); };
  }, [results]);

  // Last-resort guard: whatever happens, an idle page always shows listings.
  useEffect(() => {
    if (searching || results.length) return;
    let cancelled = false;
    (async () => {
      const pool = await loadDefaultPool(listingType).catch(() => [] as UnifiedResult[]);
      if (cancelled || !pool.length) return;
      setResults(pool);
      setShowingFallback(true);
    })();
    return () => { cancelled = true; };
  }, [searching, results.length, loadDefaultPool, listingType]);



  // Abort the running fetch and immediately show the partial results found
  // so far. Nothing is cleared.
  const cancelSearch = useCallback(() => {
    searchTokenRef.current++;
    setSearching(false);
    setSearchProgress(null);
    toast.info('החיפוש בוטל — מוצגות התוצאות שנמצאו עד כה');
  }, []);


  // Persist the full search state (criteria + results) on every change, so
  // navigating away and back restores the exact same table.
  useEffect(() => {
    saveCache({ q, listingType, city, propertyType, rooms, maxPrice, areaMin, hasSearched, results: results.slice(0, 100) });
  }, [q, listingType, city, propertyType, rooms, maxPrice, areaMin, hasSearched, results]);


  // A pasted Yad2 link is scraped end-to-end on the spot (full page: details,
  // gallery, description) and the user lands directly on the imported card.
  const submitQuery = useCallback(async () => {
    const raw = q.trim();
    const url = raw.match(/https?:\/\/\S+/i)?.[0];
    if (url && /yad2\.co\.il/i.test(url)) {
      const toastId = toast.loading('סורק את עמוד יד2 ומייבא את כל הפרטים…');
      setSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke('yad2-unlocker', {
          body: { url, limit: 1, pages: 1 },
        });
        if (error) throw error;
        if (data?.error) throw new Error(String(data.detail || data.error));
        const row = Array.isArray(data?.results) ? data.results[0] : null;
        if (!row) throw new Error('לא הצלחתי לחלץ נתונים מהעמוד הזה');

        let localId: string | null = null;
        if (row.external_id) {
          const { data: found } = await supabase
            .from('listings').select('id')
            .eq('source', 'yad2').eq('external_id', String(row.external_id)).limit(1);
          localId = found?.[0]?.id ?? null;
        }
        if (!localId && row.source_url) {
          const { data: found } = await supabase
            .from('listings').select('id').eq('source_url', row.source_url).limit(1);
          localId = found?.[0]?.id ?? null;
        }
        toast.success('הנכס יובא מיד2', { id: toastId });
        if (localId) { navigate(`/properties/${localId}`); return; }
        toast.info('הנכס נסרק אך לא נשמר במאגר — נסה שוב', { id: toastId });
      } catch (e: any) {
        toast.error('ייבוא מיד2 נכשל: ' + String(e?.message ?? 'שגיאה'), { id: toastId });
      } finally {
        setSearching(false);
      }
      return;
    }
    if (url) {
      setQuickLinkSeed(raw);
      setAddOpen(true);
      return;
    }
    runSearch();
  }, [q, runSearch, navigate]);

  // Voice commands are committed to state first and then submitted, ensuring
  // the search parser receives the complete transcript rather than stale text.
  useEffect(() => {
    if (!voiceSearchPendingRef.current || !q.trim()) return;
    voiceSearchPendingRef.current = false;
    void submitQuery();
  }, [q, submitQuery]);


  // Local rows navigate immediately. Starting a full source scrape here used
  // to compete with the detail query for bandwidth and backend capacity; the
  // detail page now performs enrichment only after its local text has painted.
  const handleSelect = (r: UnifiedResult) => {
    if (r.localId) {
      navigate(`/properties/${r.localId}`, { state: { propertySnapshot: r } });
      return;
    }
    setPreviewResult(r);
    setPreviewOpen(true);
    // External row — import it into the DB in the background, then pull the
    // full gallery and metadata so it is permanently cached.
    void (async () => {
      try {
        const id = await autoImportResult(r);
        await ensureFullPropertyImport(id, r.url ?? null);
        queryClient.invalidateQueries({ queryKey: ['properties-search'] });
      } catch (err) {
        console.warn('[Properties] background full import failed', err);
      }
    })();
  };


  const handleImport = async (r: UnifiedResult) => {
    if (r.localId) { navigate(`/properties/${r.localId}`, { state: { propertySnapshot: r } }); return; }
    setImportingKey(r.key);
    try {
      const id = await autoImportResult(r);
      toast.success('יובא אוטומטית למאגר');
      queryClient.invalidateQueries({ queryKey: ['properties-search'] });
      setPreviewOpen(false);
      navigate(`/properties/${id}`, { state: { propertySnapshot: { ...r, localId: id } } });
    } catch (err: any) {
      console.error('[Properties] auto-import failed', err);
      toast.error('ייבוא אוטומטי נכשל: ' + (err?.message ?? 'שגיאה'));
    } finally {
      setImportingKey(null);
    }
  };

  const cityOptions = useMemo(() => {
    const cities = new Set<string>(CITY_OPTIONS as readonly string[]);
    results.forEach((r) => { if (r.city) cities.add(r.city); });
    return Array.from(cities);
  }, [results]);

  // Transaction-type toggle filters the rendered list instantly (the live
  // search re-runs in parallel through the effect below).
  const typeFiltered = useMemo(() => {
    // Blank / half-scraped rows never reach the screen.
    const relevant = results.filter(isRelevantListing);
    const results_ = relevant;
    const bySource = sourceFilter
      ? results_.filter((r) => (r.sources ?? [r.source]).includes(sourceFilter))
      : results_;
    const base = sourceFilter && !bySource.length ? results_ : bySource;
    if (listingType === 'all') return base;
    const narrowed = base.filter((r) => r.listing_type === listingType);
    // Never let a toggle blank the table — keep the wider pool instead.
    return narrowed.length ? narrowed : base;
  }, [results, listingType, sourceFilter]);


  const sortedResults = useMemo(() => {
    const arr = [...typeFiltered];
    const numOr = (v: number | null | undefined, fallback: number) => (typeof v === 'number' && !Number.isNaN(v) ? v : fallback);
    // Most-recent-first is the baseline everywhere: even "relevance" keeps
    // freshly posted properties on top so the list never looks stale.
    const byCreatedDesc = (a: UnifiedResult, b: UnifiedResult) =>
      String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
    switch (sortBy) {
      case 'price_asc':
        return arr.sort((a, b) => numOr(a.price, Number.POSITIVE_INFINITY) - numOr(b.price, Number.POSITIVE_INFINITY));
      case 'price_desc':
        return arr.sort((a, b) => numOr(b.price, Number.NEGATIVE_INFINITY) - numOr(a.price, Number.NEGATIVE_INFINITY));
      case 'rooms_desc':
        return arr.sort((a, b) => numOr(b.rooms, -1) - numOr(a.rooms, -1));
      case 'size_desc':
        return arr.sort((a, b) => numOr(b.size_sqm, -1) - numOr(a.size_sqm, -1));
      case 'newest':
      default:
        return arr.sort(byCreatedDesc);
    }
  }, [typeFiltered, sortBy]);

  // Lazy loading — render 10 rows at a time and grow as the sentinel scrolls
  // into view, so a deep Yad2 directory pull never freezes the page.
  const PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [results, sortBy, listingType, viewMode]);
  const pagedResults = useMemo(() => sortedResults.slice(0, visibleCount), [sortedResults, visibleCount]);
  const hasMore = visibleCount < sortedResults.length;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisibleCount((c) => c + PAGE_SIZE);
      }
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, pagedResults.length]);

  // Re-run the live multi-source search whenever the transaction-type toggle
  // changes after the first search, so external gateways get the new filter.
  const firstTypeRunRef = useRef(true);
  useEffect(() => {
    if (firstTypeRunRef.current) { firstTypeRunRef.current = false; return; }
    if (!hasSearched) return;
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingType]);

  // Airplane action — send the property straight to the campaign composer
  // with an auto-generated post + first comment. External rows are imported
  // first so the composer has a real listing to build from.
  const goToCampaign = useCallback(async (r: UnifiedResult) => {
    let id = r.localId;
    if (!id) {
      setImportingKey(r.key);
      try {
        id = await autoImportResult(r);
      } catch (err: any) {
        console.error('[Properties] campaign import failed', err);
        toast.error('ייבוא הנכס לקמפיין נכשל: ' + (err?.message ?? 'שגיאה'));
        return;
      } finally {
        setImportingKey(null);
      }
    }
    navigate(`/campaigns?tab=create&channel=facebook&properties=${id}&listing=${id}`);
  }, [navigate]);


  // Per-source count breakdown for the total-count dropdown.
  const sourceBreakdown = useMemo(() => {
    // Real, deduped counts of what the table actually holds per source.
    const buckets = new Map<string, number>();
    results.forEach((r) => {
      for (const s of (r.sources?.length ? r.sources : [r.source])) {
        buckets.set(s, (buckets.get(s) ?? 0) + 1);
      }
    });
    const keys = new Set<string>([...Object.keys(sourceStatus), ...buckets.keys()]);
    return Array.from(keys).map((src) => {
      const info = sourceStatus[src];
      const rendered = buckets.get(src) ?? 0;
      return {
        key: src as PropertySource,
        // Rendered rows win — the status count is only a hint before dedupe.
        count: rendered || info?.count || 0,
        status: info?.status ?? 'ok',
        error: info?.error,
      };
    }).sort((a, b) => b.count - a.count);
  }, [sourceStatus, results]);

  const SORT_LABELS: Record<typeof sortBy, string> = {
    relevance: 'רלוונטיות',
    price_asc: 'מחיר: נמוך לגבוה',
    price_desc: 'מחיר: גבוה לנמוך',
    rooms_desc: 'הכי הרבה חדרים',
    size_desc: 'הכי גדול (מ״ר)',
    newest: 'החדשים ביותר',
  };

  // Active advanced-filter criteria rendered as readable, removable words
  // right inside the search field.
  const filterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (city && city !== 'כל הערים') {
      chips.push({
        key: 'city',
        label: city === '__my_zones__' ? 'אזורי ההתמחות שלי' : city,
        clear: () => setCity('כל הערים'),
      });
    }
    if (propertyType !== 'all') {
      chips.push({
        key: 'ptype',
        label: PROPERTY_TYPE_LABELS_HE[propertyType] ?? String(propertyType),
        clear: () => setPropertyType('all'),
      });
    }
    if (rooms !== 'any') {
      chips.push({ key: 'rooms', label: `${rooms}+ חדרים`, clear: () => setRooms('any') });
    }
    if (maxPrice < PRICE_MAX) {
      chips.push({ key: 'price', label: `עד ${formatPrice(maxPrice)}`, clear: () => setMaxPrice(PRICE_MAX) });
    }
    if (areaMin) {
      chips.push({ key: 'area', label: `מ-${areaMin} מ"ר`, clear: () => setAreaMin('') });
    }
    return chips;
  }, [city, propertyType, rooms, maxPrice, areaMin]);


  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden min-w-0" dir="rtl">
      <header className="text-right">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">נכסים</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          חיפוש מאוחד — הומלי, יד-2 והמאגר שלך במקום אחד. לחץ על נכס לתצוגה מלאה, וסמן נכסים לייבוא קבוצתי.
        </p>
      </header>

      {/* Compact unified control bar */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>



        {/* Row 1 — search field: [filter icon] [active filter words] [text] [go] */}
        <div className="flex items-center gap-2" dir="rtl">
          <div className="relative flex-1 min-w-[200px]">
            <div className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background ps-2 pe-24 py-1 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  aria-label="סינון מתקדם"
                  title="סינון מתקדם"
                  className={`inline-flex shrink-0 items-center justify-center h-7 w-7 rounded-md transition-colors ${filtersOpen || filterChips.length ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                >
                  <Filter className="h-4 w-4" />
                </button>
              </CollapsibleTrigger>

              {filterChips.map((chip) => (
                <span
                  key={chip.key}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/30 px-2 py-0.5 text-xs font-semibold"
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={() => { chip.clear(); }}
                    aria-label={`הסר סינון ${chip.label}`}
                    className="hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); submitQuery(); }
                  if (e.key === 'Backspace' && !q && filterChips.length) filterChips[filterChips.length - 1].clear();
                }}
                placeholder={filterChips.length ? 'הוסף מילות חיפוש…' : 'חיפוש נכסים או הדבקת קישור יד2'}
                aria-label="חיפוש נכסים"
                className="flex-1 min-w-[90px] bg-transparent text-right text-sm outline-none placeholder:text-muted-foreground h-7"
                dir="rtl"
               />
              <VoiceInputButton
                size="sm"
                title="חיפוש קולי"
                language="he"
                onTranscript={(t) => {
                  voiceSearchPendingRef.current = true;
                  setQ(t);
                }}
              />
             </div>
            <Button
              type="button"
              size="sm"
              variant={searching ? 'destructive' : 'default'}
              onClick={searching ? cancelSearch : submitQuery}
              aria-label={searching ? 'בטל חיפוש' : 'חפש'}
              title={searching ? 'בטל חיפוש' : 'חפש'}
              className="absolute left-1.5 top-1.5 h-7 gap-1.5 px-3 text-xs"
            >
              {searching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <SearchIcon className="h-3.5 w-3.5" />
              )}
              <span>{searching ? 'בטל' : 'חפש'}</span>
            </Button>

          </div>



        </div>



        {/* Row 2 — actions: [view toggle] ⇢ opposite side ⇠ [sort] [total count + breakdown] */}
        <div className="flex items-center gap-2 mt-3" dir="rtl">
          {/* Side A — sort + total-count dropdown */}
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  aria-label="מיון"
                  title="מיון"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{SORT_LABELS[sortBy]}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs">מיון תוצאות</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                  {(Object.keys(SORT_LABELS) as Array<keyof typeof SORT_LABELS>).map((key) => (
                    <DropdownMenuRadioItem key={key} value={key} className="text-xs">
                      {SORT_LABELS[key]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {hasSearched && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary px-3 h-8 hover:bg-primary/20 transition-colors"
                    aria-label="פירוט תוצאות לפי מקור"
                    title="פירוט תוצאות לפי מקור"
                  >
                    <Database className="h-3.5 w-3.5" />
                    {/* +4px vs the previous 10px badge → 14px = text-sm */}
                    <span className="text-sm font-bold tabular-nums leading-none">{results.length}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="text-xs">תוצאות לפי מקור</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {sourceBreakdown.length === 0 && (
                    <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                      אין נתוני פירוט
                    </DropdownMenuItem>
                  )}
                  {sourceBreakdown.map((row) => {
                    const isError = row.status === 'error';
                    const active = sourceFilter === row.key;
                    return (
                      <DropdownMenuItem
                        key={row.key}
                        className={`text-xs justify-between gap-3 cursor-pointer ${active ? 'bg-primary/10 text-primary' : ''}`}
                        title={row.error ?? 'סנן את הטבלה לפי מקור זה'}
                        onSelect={(e) => {
                          e.preventDefault();
                          // Click a source to filter + float it to the top of the table.
                          setSourceFilter(active ? null : row.key);
                        }}
                      >
                        <span className="flex flex-col items-start gap-0.5">
                          <span className="flex items-center gap-2">
                            <SourceBadge source={row.key} compact />
                            <span>{sourceLabel(row.key)}</span>
                          </span>
                          {isError && row.error && (
                            <span className="text-[10px] text-destructive max-w-[11rem] truncate">
                              {row.error}
                            </span>
                          )}
                        </span>
                        <span className={`font-bold tabular-nums ${isError ? 'text-destructive' : ''}`}>
                          {isError && !row.count ? '!' : row.count}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  {sourceFilter && (
                    <DropdownMenuItem
                      className="text-xs justify-center text-primary"
                      onSelect={(e) => { e.preventDefault(); setSourceFilter(null); }}
                    >
                      נקה סינון מקור
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem className="text-xs justify-between gap-3 font-semibold">
                    <span>סה״כ (לאחר איחוד)</span>
                    <span className="tabular-nums">{results.length}</span>
                  </DropdownMenuItem>

                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Transaction type: הכל / להשכרה / למכירה — same toolbar row,
                between the results-count pill and the view toggle. */}
            <div className="inline-flex items-center rounded-md border border-primary/20 bg-card/40 p-0.5" role="group" aria-label="סוג עסקה">
              {(['all', 'rent', 'sale'] as Array<ListingType | 'all'>).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setListingType(t)}
                  aria-pressed={listingType === t}
                  className={`px-3 h-7 text-xs font-semibold rounded transition-colors ${
                    listingType === t
                      ? (t === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-deal-blue text-deal-blue-foreground shadow-sm')
                      : (t === 'all' ? 'text-muted-foreground hover:text-foreground' : 'text-deal-blue hover:bg-deal-blue/10')
                  }`}
                >
                  {t === 'all' ? 'הכל' : LISTING_TYPE_LABELS_HE[t]}
                </button>
              ))}
            </div>
          </div>



          {/* Side B — view toggle */}
          <div className="ms-auto inline-flex rounded-md border border-border bg-card/50 p-0.5" role="group" aria-label="מצב תצוגה">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              aria-label="תצוגת כרטיסיות"
              title="כרטיסיות"
              className={`inline-flex items-center justify-center h-8 w-9 rounded-sm transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-pressed={viewMode === 'table'}
              aria-label="תצוגת טבלה"
              title="טבלה"
              className={`inline-flex items-center justify-center h-8 w-9 rounded-sm transition-colors ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>



        <CollapsibleContent>
          <Card className="p-4 sm:p-5 mt-3">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold">סינון מתקדם</div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFiltersOpen(false)}
                className="h-8 gap-1.5 text-xs"
                aria-label="סגור סינון"
                title="סגור סינון"
              >
                <ChevronUp className="h-3.5 w-3.5" />
                סגור
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>



            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">מחיר מקסימלי</Label>
                  <span className="text-xs text-muted-foreground">עד {formatPrice(maxPrice)}</span>
                </div>
                <Slider dir="rtl" min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP} value={[maxPrice]} onValueChange={(v) => setMaxPrice(v[0] ?? PRICE_MAX)} />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">אזור</Label>
                <Select value={city} onValueChange={setCity}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="כל הערים">כל הערים</SelectItem>
                    {isConfigured && <SelectItem value="__my_zones__">כל אזורי ההתמחות שלי</SelectItem>}
                    {(isConfigured ? coveredCities : cityOptions).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">סוג נכס</Label>
                <Select value={propertyType} onValueChange={(v) => setPropertyType(v as PropertyType | 'all')}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROPERTY_TYPE_LABELS_HE).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">חדרים (לפחות)</Label>
                <Select value={rooms} onValueChange={setRooms}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">כל מספר</SelectItem>
                    {[2, 3, 4, 5, 6].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}+ חדרים</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">שטח מינימלי (מ"ר)</Label>
                <Input type="number" inputMode="numeric" value={areaMin} onChange={(e) => setAreaMin(e.target.value)} className="h-10" />
              </div>

              <div className="flex items-end gap-2">
                <Button variant="outline" size="sm" className="h-10 flex-1" onClick={() => {
                  setCity('כל הערים'); setPropertyType('all'); setRooms('any'); setMaxPrice(PRICE_MAX); setAreaMin('');
                }}>איפוס</Button>
                <Button size="sm" className="h-10 flex-1" onClick={() => { setFiltersOpen(false); runSearch(); }} disabled={searching}>
                  החל
                </Button>

              </div>
            </div>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Results */}
      <ErrorBoundary source="Properties.Results">
        {searching && sortedResults.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-full rounded-lg" />
            ))}
          </div>
        ) : sortedResults.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            {viewMode === 'table' ? (

              <ResultTable
                results={pagedResults}
                importingKey={importingKey}
                onSelect={handleSelect}
                onCampaign={goToCampaign}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pagedResults.map((r) => (
                  <ResultCard
                    key={r.key}
                    result={r}
                    importing={importingKey === r.key}
                    onSelect={() => handleSelect(r)}
                    onCampaign={() => goToCampaign(r)}
                  />
                ))}
              </div>
            )}
            {hasMore && (
              <div ref={sentinelRef} className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                טוען עוד נכסים… ({pagedResults.length}/{sortedResults.length})
              </div>
            )}
          </>
        )}
      </ErrorBoundary>


      <AddPropertyDialog
        open={addOpen}
        onOpenChange={(o) => { setAddOpen(o); if (!o) setQuickLinkSeed(null); }}
        onCreated={() => { queryClient.invalidateQueries({ queryKey: ['properties-search'] }); runSearch(); }}
        initialText={quickLinkSeed ?? undefined}
        autoHydrate={!!quickLinkSeed}
        defaultSource="manual"
      />
      <ManualPropertyDialog open={manualOpen} onOpenChange={setManualOpen} onCreated={runSearch} />
      <ImportPropertiesDialog open={importOpen} onOpenChange={setImportOpen} onImported={runSearch} />
      <HomelyBulkSyncDialog open={homelyBulkOpen} onOpenChange={setHomelyBulkOpen} onImported={runSearch} mode="properties" />
      <ImportProgressDialog
        open={progressOpen}
        onOpenChange={setProgressOpen}
        steps={importSteps}
        onDone={() => { runSearch(); }}
      />
      <PropertyPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        result={previewResult}
        onCampaign={(r) => { setPreviewOpen(false); goToCampaign(r); }}
        importing={previewResult ? importingKey === previewResult.key : false}
      />
    </div>
  );
}

function ResultCard({
  result,
  importing,
  onSelect,
  onCampaign,
}: {
  result: UnifiedResult;
  importing: boolean;
  onSelect: () => void;
  onCampaign?: () => void;
}) {

  const [pulledPhotos, setPulledPhotos] = useState<string[] | null>(null);
  const [pulling, setPulling] = useState(false);
  const { notesByListing } = usePropertyNotesByListing();
  const cardNotes = result.localId ? notesByListing.get(result.localId) : undefined;
  const photos = (pulledPhotos ?? result.photos ?? []).filter(Boolean);
  const hasPhotos = photos.length > 0;
  const hasMany = photos.length > 1;

  const [index, setIndex] = useState(0);
  // Lazy gallery: until the card is expanded we only paint the cover image.
  // Already-imported photos come straight from the DB/storage URLs, so the
  // cover is instant; the rest are fetched on expand.
  const [expanded, setExpanded] = useState(false);
  // Total number of images the property has — reported by the source payload
  // even when the media was not imported into our storage yet.
  const photoCount = sourcePhotoCount(result, photos.length);
  const activePhoto = hasPhotos ? photos[Math.min(index, photos.length - 1)] : null;
  const isRent = result.listing_type === 'rent';

  const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); e.preventDefault(); };
  const goPrev = (e: React.SyntheticEvent) => { stop(e); setIndex((i) => (i - 1 + photos.length) % photos.length); };
  const goNext = (e: React.SyntheticEvent) => { stop(e); setIndex((i) => (i + 1) % photos.length); };

  /** Manual on-demand full-gallery pull + permanent mirroring. */
  const pullAllImages = async (e: React.SyntheticEvent) => {
    stop(e);
    if (pulling) return;
    setPulling(true);
    const toastId = toast.loading('טוען את כל התמונות…');
    try {
      const { data, error } = await supabase.functions.invoke('fetch-property-all-images', {
        body: { listing_id: result.localId ?? undefined, source_url: result.url ?? undefined },
      });
      if (error) throw error;
      const res = data as { ok?: boolean; count?: number; photos?: string[]; reason?: string } | null;
      if (!res?.ok || !res.photos?.length) {
        toast.error('לא נמצאו תמונות נוספות', { id: toastId, description: res?.reason ?? undefined });
        return;
      }
      setPulledPhotos(res.photos);
      setIndex(0);
      setExpanded(true);
      toast.success(`${res.count} תמונות נטענו ונשמרו`, { id: toastId });
    } catch (err: any) {
      toast.error('טעינת התמונות נכשלה', { id: toastId, description: err?.message ?? String(err) });
    } finally {
      setPulling(false);
    }
  };


  return (
    <Card className="overflow-hidden flex flex-col group hover:shadow-lg transition-shadow cursor-pointer relative" onClick={onSelect}>
      {/* Dedicated full-width title row — always the first element of the card. */}
      <div className="w-full px-4 pt-3 pb-2 border-b">
        <h3 className="w-full font-semibold text-base leading-tight truncate" title={result.title}>
          {result.title}
        </h3>
      </div>
      <div className="aspect-[16/10] bg-muted relative overflow-hidden">

        {activePhoto ? (
          <img
            key={activePhoto}
            src={activePhoto}
            alt={`${result.title} — ${index + 1}/${photos.length}`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">אין תמונה</div>
        )}

        {photoCount > 0 && (
          <button
            type="button"
            onClick={(e) => { stop(e); setExpanded((v) => !v); }}
            className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm"
            title={`${photoCount} תמונות`}
            aria-label={`${photoCount} תמונות`}
          >
            <ImageIcon className="h-3 w-3" />
            {photoCount}
          </button>
        )}

        {(result.localId || result.url) && (
          <button
            type="button"
            onClick={pullAllImages}
            disabled={pulling}
            className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm hover:bg-black/80 disabled:opacity-60"
            title="טען את כל התמונות"
            aria-label="טען את כל התמונות"
          >
            {pulling ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            טען תמונות
          </button>
        )}


        {/* Side navigation arrows — RTL: right chevron = previous, left chevron = next */}
        {hasMany && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="תמונה קודמת"
              title="תמונה קודמת"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/70 hover:bg-background text-foreground shadow-sm backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity z-10"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="תמונה הבאה"
              title="תמונה הבאה"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/70 hover:bg-background text-foreground shadow-sm backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity z-10"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/70 text-foreground text-[10px] font-semibold tabular-nums px-2 py-0.5 shadow-sm backdrop-blur-sm z-10">
              {index + 1} / {photos.length}
            </div>
          </>
        )}

        <div className="absolute top-3 right-3 z-10 flex flex-row-reverse items-center gap-1">
          {(result.sources ?? [result.source]).map((s) => (
            <SourceBadge key={s} source={s} />
          ))}
        </div>
        {result.listing_type && (
          <Badge className={`absolute top-3 left-3 border z-10 ${isRent ? 'bg-[#0b3982] text-white border-[#0b3982]' : 'bg-primary text-primary-foreground'}`}>
            {LISTING_TYPE_LABELS_HE[result.listing_type]}
          </Badge>
        )}
        {isNewListing(result) ? (
          <Badge className="absolute top-11 left-3 z-10 border-0 bg-[#FF7A00] text-white shadow-sm">
            חדש
          </Badge>
        ) : isOldListing(result) ? (
          <Badge className="absolute top-11 left-3 z-10 border-0 bg-slate-500 text-white shadow-sm">
            ותיק
          </Badge>
        ) : null}

        {importing && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm z-20">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Loader2 className="h-4 w-4 animate-spin" /> מייבא למאגר…
            </div>
          </div>
        )}
      </div>

      {/* Thumbnail row — lazily mounted: images load only once expanded */}
      {hasMany && expanded && (
        <div
          className="flex gap-1.5 overflow-x-auto px-2 py-2 bg-muted/40 border-b scrollbar-thin"
          dir="rtl"
          onClick={stop}
          onWheel={(e) => e.stopPropagation()}
        >
          {photos.map((p, i) => {
            const active = i === index;
            return (
              <button
                key={`${p}-${i}`}
                type="button"
                onClick={(e) => { stop(e); setIndex(i); }}
                aria-label={`תמונה ${i + 1}`}
                aria-current={active}
                className={`relative shrink-0 h-10 w-14 rounded-md overflow-hidden border transition-all ${active ? 'border-primary ring-2 ring-primary/40' : 'border-border/60 opacity-70 hover:opacity-100'}`}
              >
                <img src={p} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            );
          })}
        </div>
      )}

      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Property notes — full text, directly under the property name. */}
        <PropertyNotesBlock notes={cardNotes} />
        {result.description && <p className="text-xs text-muted-foreground line-clamp-2">{result.description}</p>}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {result.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {result.city}</span>}
          {result.rooms ? <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" /> {result.rooms} חד'</span> : null}
          {result.size_sqm ? <span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5" /> {result.size_sqm} מ"ר</span> : null}
        </div>

        <div className="flex items-center justify-between mt-auto pt-2 border-t gap-2 flex-wrap">
          <div className="text-lg font-bold text-success inline-flex items-center gap-1">
            {result.price
              ? (<>{formatPrice(result.price)}{isRent ? <span className="text-xs font-normal text-muted-foreground">/חודש</span> : null}</>)
              : (<span className="text-sm font-semibold text-amber-600">פרטים חסרים</span>)}
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <PropertyShareMenu results={[result]} />
            {onCampaign && (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); onCampaign(); }}
                className="gap-1.5"
                title="צור קמפיין לנכס"
                aria-label="צור קמפיין לנכס"
              >
                <Megaphone className="h-4 w-4" />
                פרסם
              </Button>
            )}
          </div>


        </div>
      </div>
    </Card>
  );
}

/** Neighborhood for the table, resolved from the row or its source payload. */
function neighborhoodOf(r: UnifiedResult): string {
  const raw = (r.raw ?? {}) as any;
  const meta = (raw?.source_metadata ?? {}) as any;
  const v = r.neighborhood ?? raw.neighborhood ?? meta.neighborhood ?? meta.neighbourhood ?? meta.area ?? raw.area ?? null;
  return typeof v === 'string' ? v.trim() : '';
}

type SortCol = 'name' | 'neighborhood' | 'house_number' | 'apt_number' | 'listing_type' | 'price' | 'city' | 'address' | 'rooms' | 'size_sqm' | 'photos' | 'published';

/** Official Yad2 button — rendered only after the ad is verified as still live. */
function Yad2AdButton({ url }: { url: string }) {
  const status = useYad2AdStatus(url);
  if (status !== 'live') return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="פתח את המודעה ביד2"
      aria-label="פתח את המודעה ביד2"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
    >
      <Yad2Icon className="h-5 w-5" />
    </a>
  );
}


function ResultTable({
  results,
  importingKey,
  onSelect,
  onCampaign,
}: {
  results: UnifiedResult[];
  importingKey: string | null;
  onSelect: (r: UnifiedResult) => void;
  onCampaign?: (r: UnifiedResult) => void;
}) {

  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const { notesByListing } = usePropertyNotesByListing();

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortCol) return results;
    const arr = [...results];
    const getVal = (r: UnifiedResult): string | number | null => {
      switch (sortCol) {

        case 'name': return formatStreetTypeTitle({ address: r.address, city: r.city, neighborhood: r.neighborhood, property_type: r.property_type, title: r.title, raw: r.raw }) || '';
        case 'neighborhood': return neighborhoodOf(r) || '';
        case 'house_number': return Number(houseNumberOf({ address: r.address, raw: r.raw })) || null;
        case 'apt_number': return Number(apartmentNumberOf({ address: r.address, raw: r.raw })) || null;
        case 'listing_type': return r.listing_type ?? '';
        case 'price': return typeof r.price === 'number' ? r.price : null;
        case 'city': return r.city ?? '';
        case 'address': return stripAddressNumbers(r.address ?? '') || '';
        case 'rooms': return typeof r.rooms === 'number' ? r.rooms : (r.rooms ? Number(r.rooms) : null);
        case 'size_sqm': return typeof r.size_sqm === 'number' ? r.size_sqm : (r.size_sqm ? Number(r.size_sqm) : null);
        case 'photos': return sourcePhotoCount(r, r.photos?.length ?? 0) || null;
        case 'published': return listingPublishedAt(r) ?? listingActivityAt(r);


      }
    };
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const av = getVal(a); const bv = getVal(b);
      const aNull = av === null || av === undefined || av === '' || (typeof av === 'number' && Number.isNaN(av));
      const bNull = bv === null || bv === undefined || bv === '' || (typeof bv === 'number' && Number.isNaN(bv));
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'he') * dir;
    });
    return arr;
  }, [results, sortCol, sortDir]);

  const HeaderCell = ({ col, label, extraClass }: { col: SortCol; label: string; extraClass?: string }) => (
    <th
      className={`px-2 py-2 font-semibold whitespace-nowrap cursor-pointer select-none hover:bg-muted ${extraClass ?? ''}`}
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortCol === col ? (
          <span className="text-xs opacity-70">{sortDir === 'asc' ? '▲' : '▼'}</span>
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </th>
  );

  return (
    <Card className="overflow-x-auto max-w-full w-full">
      <table className="w-full text-[15px]" dir="rtl">
        <thead className="bg-muted/50 sticky top-0">
          <tr className="text-right">
            <th className="px-2 py-2 w-14 font-semibold whitespace-nowrap">תמונה</th>

            <HeaderCell col="name" label="רחוב" />
            {/* Internal-only: house & apartment numbers never leave the workspace. */}
            <HeaderCell col="house_number" label="בית" />
            <HeaderCell col="apt_number" label="דירה" />
            <HeaderCell col="neighborhood" label="שכונה" />
            <HeaderCell col="listing_type" label="סוג" />
            <HeaderCell col="price" label="מחיר" />
            <HeaderCell col="city" label="עיר" />
            <HeaderCell col="rooms" label="חדרים" />
            <HeaderCell col="size_sqm" label='מ"ר' />
            <HeaderCell col="photos" label="תמונות" />
            <HeaderCell col="published" label="תאריך פרסום/עדכון" />
            <th className="px-2 py-2 font-semibold whitespace-nowrap text-left">פעולה</th>


          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const isRent = r.listing_type === 'rent';
            const importing = importingKey === r.key;
            const rowNotes = r.localId ? notesByListing.get(r.localId) : undefined;
            return (
              <Fragment key={r.key}>
              <tr className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(r)}>
                <td className="px-2 py-1.5">
                  <div className="relative h-11 w-11 rounded-md overflow-hidden bg-muted border border-border/60 shrink-0">
                    {r.photos?.[0] ? (
                      <img
                        src={r.photos[0]}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-muted-foreground/50" />
                      </div>
                    )}
                    {/* Total images available on the SOURCE page, even if not imported. */}
                    {(() => {
                      const total = sourcePhotoCount(r, r.photos?.length ?? 0);
                      return total > 0 ? (
                        <span className="absolute top-0 right-0 rounded-bl-md bg-black/70 px-1 text-[9px] font-bold leading-[13px] text-white tabular-nums">
                          {total}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </td>
                <td className="px-2 py-1.5 max-w-[320px] truncate">
                  {(() => {
                    // Internal table "רחוב" column: street name + property type only.
                    const label = formatStreetTypeTitle({
                      address: r.address,
                      city: r.city,
                      neighborhood: r.neighborhood,
                      property_type: r.property_type,
                      title: r.title,
                      raw: r.raw,
                    });
                    const link = r.localId
                      ? <Link to={`/properties/${r.localId}`} state={{ propertySnapshot: r }} className="hover:underline" onClick={(e) => e.stopPropagation()} title={label}>{label}</Link>
                      : <span title={label}>{label}</span>;
                    return (
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        {isNewListing(r) ? (
                          <span className="shrink-0 rounded-full bg-[#FF7A00] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm">חדש</span>
                        ) : isOldListing(r) ? (
                          <span className="shrink-0 rounded-full bg-slate-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm">ותיק</span>
                        ) : null}
                        <span className="truncate">{link}</span>
                      </span>
                    );
                  })()}

                </td>
                <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{houseNumberOf({ address: r.address, raw: r.raw }) || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{apartmentNumberOf({ address: r.address, raw: r.raw }) || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap max-w-[10rem] truncate">{neighborhoodOf(r) || '—'}</td>
                <td className={`px-2 py-1.5 whitespace-nowrap text-xs font-bold ${isRent ? 'text-[#f59e0b]' : 'text-success'}`}>{LISTING_TYPE_LABELS_HE[r.listing_type]}</td>
                <td className={`px-2 py-1.5 whitespace-nowrap font-semibold ${isRent ? 'text-[#f59e0b]' : 'text-success'}`}>{r.price ? formatPrice(r.price) : '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.city || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.rooms ?? '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.size_sqm ?? '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {(() => {
                    // Total images on the SOURCE ad, even before any import.
                    const total = sourcePhotoCount(r, r.photos?.length ?? 0);
                    if (!total) return <span className="text-muted-foreground">—</span>;
                    return (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground/80"
                        title={`${total} תמונות במודעת המקור`}
                      >
                        <ImageIcon className="h-3.5 w-3.5 opacity-70" />
                        {total}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap tabular-nums text-muted-foreground"><ListingDateCell row={r} /></td>

                <td className="px-2 py-1.5 whitespace-nowrap text-left" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex items-center gap-1.5">
                    {/* Yad2 ad first, campaign second (swapped per workspace spec). */}
                    {(() => {
                      const live = sourceYad2Url(r);
                      if (!live) return null;
                      return <Yad2AdButton url={live} />;
                    })()}

                    <Button
                      size="icon"
                      variant="ghost"
                      title="צור קמפיין לנכס"
                      aria-label="צור קמפיין לנכס"
                      disabled={importing}
                      onClick={(e) => { e.stopPropagation(); onCampaign ? onCampaign(r) : onSelect(r); }}
                      className="h-8 w-8"
                    >
                      {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
                    </Button>

                    <PropertyShareMenu results={[r]} iconOnly variant="ghost" />
                  </div>
                </td>


              </tr>
              {rowNotes && rowNotes.length > 0 && (
                <tr className="border-t-0 bg-amber-50/40">
                  <td className="px-2 pb-2" />
                  <td className="px-2 pb-2" colSpan={12}>
                    <PropertyNotesBlock notes={rowNotes} />
                  </td>
                </tr>
              )}
              </Fragment>
            );

          })}
        </tbody>
      </table>
    </Card>
  );
}

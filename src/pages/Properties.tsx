import { Table } from '@/components/ui/table';
import { Fragment, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { returnState } from "@/lib/returnNav";
import { useExclusiveExpansion } from '@/hooks/useExclusiveExpansion';
import { AnimatedExpansion } from '@/components/ui/animated-expansion';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Megaphone, BedDouble, Ruler, MapPin, Building2, List, LayoutGrid,
  SlidersHorizontal, ArrowRight, Loader2, Search as SearchIcon, Filter,
   ArrowUpDown, Database, ChevronLeft, ChevronRight, X, ChevronUp, Images as ImageIcon, ChevronDown,
   RefreshCw, Handshake, Pencil, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { readRecentYad2Listing } from '@/lib/yad2LocalCache';
import { useListingPublishers } from '@/hooks/useListingPublishers';
import { SelectModeToggle, SelectAllRow } from '@/components/ui/multi-select-controls';
import { QuickPublicPromotion } from '@/components/properties/QuickPublicPromotion';
import { useInventorySuggestions } from '@/hooks/useInventorySuggestions';
import { usePropertySearchHistory } from '@/hooks/usePropertySearchHistory';
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
import { SourceBadge, sourceLabel, sourceDotClass, type PropertySource } from '@/components/properties/SourceBadge';
import { useHomelyConnection } from '@/hooks/useHomelyConnection';
import { PropertyNotesBlock } from '@/components/properties/PropertyNotesBlock';
import { usePropertyNotesByListing } from '@/hooks/usePropertyNotes';
import { searchAllSources, searchLocalListings, searchMarketPool, type UnifiedResult, type SearchFilters } from '@/lib/propertySearch';
import { autoImportResult } from '@/lib/propertyAutoImport';
import { sourcePhotoCount } from '@/lib/photoCount';
import { formatListingTitle, formatInternalListingTitle, formatStreetTypeTitle } from '@/lib/formatListingTitle';
import { houseNumberOf, apartmentNumberOf } from '@/lib/addressNumbers';
import { ensureFullPropertyImport, ensureMetadataImport } from '@/lib/propertyFullSync';
import { isNewListing, isOldListing } from '@/lib/listingFreshness';
import { isRelevantListing } from '@/lib/listingRelevance';
import { sourceYad2Url } from '@/lib/yad2Ad';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Yad2Icon } from '@/components/properties/Yad2Icon';
import { useYad2AdStatus } from '@/hooks/useYad2AdStatus';
import { formatListingDate, listingActivityAt } from '@/lib/listingDates';
import { ListingDateCell } from '@/components/properties/ListingDateCell';
import { listingPublishedAt } from '@/lib/listingFreshness';



import { ImportProgressDialog, type ImportStep } from '@/components/properties/ImportProgressDialog';
import { PropertyShareMenu } from '@/components/properties/PropertyShareMenu';
import { AffiliateCommissionButton } from '@/components/properties/AffiliateCommissionButton';
import { AffiliateShareCell, AffiliateTierPrices } from '@/components/properties/AffiliateShareCell';
import { ViewModeSwitch } from '@/components/ui/view-mode-switch';
import { useAppMode } from '@/hooks/useAppMode';
import { useAffiliateConfigs } from '@/hooks/useAffiliate';
import { useDeleteListings } from '@/hooks/useDeleteListings';
import { PropertyDeleteDialog } from '@/components/properties/PropertyDeleteDialog';
import { PropertyRowActions } from '@/components/properties/PropertyRowActions';


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
  const { activeWorkspaceId } = useWorkspace();
  const { entries: searchHistory, remember: rememberSearch } = usePropertySearchHistory(user?.id, activeWorkspaceId);
  const cached = useMemo(() => loadCache(), []);

  const [q, setQ] = useState<string>('');
  const [listingType, setListingType] = useState<ListingType | 'all'>('all');
  const [city, setCity] = useState<string>(cached?.city ?? 'כל הערים');
  const [propertyType, setPropertyType] = useState<PropertyType | 'all'>(cached?.propertyType ?? 'all');
  const [rooms, setRooms] = useState<string>(cached?.rooms ?? 'any');
  const [maxPrice, setMaxPrice] = useState<number>(cached?.maxPrice ?? PRICE_MAX);
  const [areaMin, setAreaMin] = useState<string>(cached?.areaMin ?? '');

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'price_asc' | 'price_desc' | 'rooms_desc' | 'size_desc' | 'newest'>('newest');

  const [results, setResults] = useState<UnifiedResult[]>([]);
  const [sourceStatus, setSourceStatus] = useState<Record<string, SourceInfo>>({});
  // Active source filter from the breakdown popup (null = all sources).
  const [sourceFilter, setSourceFilter] = useState<PropertySource | null>(null);
  const [selectedSources, setSelectedSources] = useState<PropertySource[]>(['yad2', 'homely', 'mine']);
  const { connected: homelyConnected } = useHomelyConnection();
  const availableSources = useMemo<PropertySource[]>(() => homelyConnected ? ['yad2', 'homely', 'mine'] : ['yad2', 'mine'], [homelyConnected]);
  const activeSources = useMemo(() => selectedSources.filter(source => availableSources.includes(source)), [selectedSources, availableSources]);
  const [completedResults, setCompletedResults] = useState<UnifiedResult[] | null>(null);
  const toggleSource = (source: PropertySource) => { setSourceFilter(null); setSelectedSources(current => current.includes(source) ? current.filter(s => s !== source) : [...current, source]); };
  const [searching, setSearching] = useState(false);
  // Live streaming progress for the active search (sources answered / total).
  const [searchProgress, setSearchProgress] = useState<{ done: number; total: number; loaded: number; pending: string[] } | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  // True when the current table is the default pool shown because the user's
  // own search returned nothing. The grid is never allowed to be empty.
  const [showingFallback, setShowingFallback] = useState(false);

  const [importingKey, setImportingKey] = useState<string | null>(null);

  // Multi-select + batch import progress
  const [importSteps, setImportSteps] = useState<ImportStep[]>([]);
  const [progressOpen, setProgressOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [homelyBulkOpen, setHomelyBulkOpen] = useState(false);
  const [quickLinkSeed, setQuickLinkSeed] = useState<string | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedListingIds, setSelectedListingIds] = useState<Set<string>>(new Set());
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
  const deleteListings = useDeleteListings();

  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<{ action: 'manual' | 'import' | 'homely' }>).detail?.action;
      if (action === 'manual') setManualOpen(true);
      else if (action === 'import') setImportOpen(true);
      else if (action === 'homely' && homelyConnected) setHomelyBulkOpen(true);
    };
    window.addEventListener('properties:add', handler);
    return () => window.removeEventListener('properties:add', handler);
  }, [homelyConnected]);

  const [poolInfo, setPoolInfo] = useState<{ last: string | null; count: number } | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from('market_scrape_runs')
        .select('finished_at, claimed_at, new_count, shared_count')
        .eq('status', 'success')
        .order('claimed_at', { ascending: false })
        .limit(1);
      const row = (data ?? [])[0] as { finished_at: string | null; claimed_at: string; new_count: number } | undefined;
      if (alive && row) setPoolInfo({ last: row.finished_at ?? row.claimed_at, count: row.new_count ?? 0 });
    })();
    return () => { alive = false; };
  }, []);


  // LOCAL-FIRST: entering the page never triggers a live scraper call.
  // The default pool is read straight from our own `listings` table
  // (100 newest for sale + 100 newest for rent across the workspace's home
  // markets), which keeps external API quota untouched. Fresh external
  // inventory arrives through the twice-daily background sync job.
  const defaultPoolRef = useRef<Map<string, UnifiedResult[]>>(new Map());
  const loadDefaultPool = useCallback(async (type: ListingType | 'all' = 'all'): Promise<UnifiedResult[]> => {
    if (!activeWorkspaceId) return [];
    const cacheKey = `${activeWorkspaceId}:${type}`;
    const cities = (isConfigured && coveredCities.length ? coveredCities : DEFAULT_CITIES).slice(0, 6);
    // Own inventory + the SHARED market pool for the same cities. The pool is
    // refreshed twice a day by the scheduled job, so any workspace working in
    // these cities sees the fresh Yad2 inventory without an API call.
    const batches = await Promise.all([
      searchLocalListings({ workspace_owner_id: activeWorkspaceId, listing_type: 'all' }).catch(() => [] as UnifiedResult[]),
      ...cities.map((c) =>
        searchMarketPool({ city: c, listing_type: 'all' }, 100).catch(() => [] as UnifiedResult[]),
      ),
    ]);
    const seen = new Set<string>();
    const seenUrls = new Set<string>();
    let all = batches.flat().filter((r) => {
      if (seen.has(r.key)) return false;
      const u = (r.url ?? '').split('?')[0];
      if (u && seenUrls.has(u)) return false;
      seen.add(r.key);
      if (u) seenUrls.add(u);
      return true;
    });
    // Safety net: if the workspace cities hold nothing yet, show all stored inventory.
    if (!all.length) {
      all = await searchLocalListings({ workspace_owner_id: activeWorkspaceId, listing_type: 'all' }).catch(() => [] as UnifiedResult[]);
      if (!all.length) all = await searchMarketPool({ listing_type: 'all' }, 200).catch(() => [] as UnifiedResult[]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [isConfigured, coveredCities.join('|'), activeWorkspaceId]);


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

  useEffect(() => {
    const refresh = () => { if (!q.trim()) void loadDefaultPool(listingType).then(setResults); };
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer); };
  }, [loadDefaultPool, listingType, q]);

  // INSTANT LOCAL FILTER — from the 3rd typed character we paint matching rows
  // straight out of our own `listings` table. Zero external calls, zero cost,
  // no waiting: external gateways only run when the user submits the search.
  const instantTokenRef = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (!activeWorkspaceId) return;
    if (term.length < 3) return;
    if (/^https?:\/\//i.test(term)) return; // URL paste → import flow
    const token = ++instantTokenRef.current;
    const timer = setTimeout(async () => {
      try {
        const rows = await searchLocalListings({
          workspace_owner_id: activeWorkspaceId ?? undefined,
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
   }, [q, listingType, activeWorkspaceId]);


  // Monotonic token — bumping it aborts the in-flight search: late partials
  // and the final payload are ignored, so whatever was already painted stays.
  const searchTokenRef = useRef(0);
  useEffect(() => { searchTokenRef.current++; setSearching(false); setSearchProgress(null); setCompletedResults(null); }, [q, listingType, city, propertyType, rooms, maxPrice, areaMin, activeSources]);
  useEffect(() => () => { searchTokenRef.current++; }, []);

  const runSearch = useCallback(async (override?: string) => {
    if (!activeWorkspaceId) return;
    const query = typeof override === 'string' ? override : q;
    const token = ++searchTokenRef.current;
    instantTokenRef.current++;
    setCompletedResults(null);
    setSearching(true);
    setSearchProgress({ done: 0, total: activeSources.length, loaded: 0, pending: activeSources });

    setHasSearched(true);
    try {
      // Parse the free-text query into structured hints so external gateways
      // (Yad2, Homely, Webtiv) receive real filters instead of raw prose.
      const { parseSearchQuery, matchesAmenities } = await import('@/lib/parseSearchQuery');
      const parsed = parseSearchQuery(query);
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
        workspace_owner_id: activeWorkspaceId ?? undefined,
        q: (parsed.keywords || query.trim()) || undefined,
        sources: activeSources,
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
      const filtered = paint().filter(isRelevantListing).filter(r =>
        (r.source !== 'homely' || homelyConnected) &&
        (r.sources?.length ? r.sources : [r.source]).some(source => activeSources.includes(source)) &&
        (effectiveListing === 'all' || !effectiveListing || r.listing_type === effectiveListing));
      setCompletedResults(filtered);
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
  }, [q, listingType, city, propertyType, rooms, maxPrice, areaMin, loadDefaultPool, activeSources, homelyConnected, activeWorkspaceId]);

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
    setCompletedResults(null);
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
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const pendingHistoryQuery = useRef<string | null>(null);
  const inventorySuggestions = useInventorySuggestions(q, activeWorkspaceId);
  const suggestions = inventorySuggestions.data ?? [];
  useEffect(() => { setSuggestionIndex(-1); }, [q]);
  useEffect(() => { setQ(''); setResults([]); defaultPoolRef.current.clear(); setSuggestionsOpen(false); setSelectedListingIds(new Set()); }, [activeWorkspaceId]);
  const markPublished = useCallback((ids: string[]) => {
    setResults(current => current.map(row => row.localId && ids.includes(row.localId) ? { ...row, raw: { ...row.raw, is_published: true, status: 'live', affiliate_enabled: true } } : row));
    setSelectedListingIds(current => new Set([...current].filter(id => !ids.includes(id))));
    defaultPoolRef.current.clear();
  }, []);
  const [yad2Status, setYad2Status] = useState<{ step: number; label: string; tone: 'busy' | 'ok' | 'error' } | null>(null);
  const yad2InFlight = useRef(false);
  const submitQuery = useCallback(async (override?: string) => {
    const raw = (typeof override === 'string' ? override : q).trim();
    rememberSearch(raw);
    setSuggestionsOpen(false);
    const found = raw.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/\S*/i)?.[0];
    // Exact ad token from /realestate/item/[region/]<token>; tracking params are dropped so the
    // scraper loads that one ad, never a feed page that could return a different property.
    const token = found?.match(/\/realestate\/item\/(?:[a-z0-9-]+\/)?([a-z0-9]+)(?=[\/?#]|$)/i)?.[1] ?? null;
    const url = found ? (token ? `https://www.yad2.co.il/realestate/item/${token}` : (/^https?:/i.test(found) ? found : `https://${found}`)) : undefined;
    if (url) {
      if (!activeWorkspaceId) return;
      if (yad2InFlight.current) return;
      yad2InFlight.current = true;
      setSearching(true);
      setYad2Status({ step: 1, label: 'בודק מודעה שמורה או מייבא מיד2…', tone: 'busy' });
      const slow = window.setTimeout(() => setYad2Status((s) => s && s.tone === 'busy' ? { step: 2, label: 'סורק פרטים, תמונות, תיאור ומאפיינים…', tone: 'busy' } : s), 2500);
      try {
        const saved = await readRecentYad2Listing(token, activeWorkspaceId);
        if (saved) {
          defaultPoolRef.current.clear();
          setYad2Status({ step: 4, label: 'הנכס נטען מהמאגר השמור', tone: 'ok' });
          setQ('');
          navigate(`/properties/${saved.listing_id}`, { state: { returnTo: '/properties' } });
          return;
        }
        const { data, error } = await supabase.functions.invoke('yad2-unlocker', {
          body: { url, limit: 1, pages: 1, import_item: true },
        });
        if (error) throw error;
        if (data?.error) throw new Error(String(data.detail || data.error));
        const results: any[] = Array.isArray(data?.results) ? data.results : [];
        const matches = (r: any) => !token || String(r?.external_id ?? '').toLowerCase() === token.toLowerCase() || String(r?.source_url ?? '').toLowerCase().includes(token.toLowerCase());
        const row = results.find(matches) ?? null;
        if (!row) throw new Error(results.length ? 'הנתונים שהתקבלו לא תואמים למודעה בקישור. נסה שוב בעוד רגע' : 'לא הצלחתי לחלץ נתונים מהעמוד הזה');
        setYad2Status({ step: 3, label: 'שומר את הנכס במאגר שלך…', tone: 'busy' });

        let localId: string | null = data?.listing_id ?? null;
        if (!localId && row.external_id) {
          const { data: found } = await supabase
            .from('listings').select('id')
            .eq('source', 'yad2').eq('external_id', String(row.external_id))
            .eq('workspace_owner_id', activeWorkspaceId as string).limit(1);
          localId = found?.[0]?.id ?? null;
        }
        if (!localId && row.source_url) {
          const { data: found } = await supabase
            .from('listings').select('id').eq('source_url', row.source_url)
            .eq('workspace_owner_id', activeWorkspaceId as string).limit(1);
          localId = found?.[0]?.id ?? null;
        }
        if (localId) {
          defaultPoolRef.current.clear();
          setYad2Status({ step: 4, label: data?.cached ? 'הנכס נטען מהמאגר השמור' : 'הנכס יובא בהצלחה — פותח את כרטיס הנכס', tone: 'ok' });
          queryClient.invalidateQueries({ queryKey: ['properties-search'] });
          setQ('');
          navigate(`/properties/${localId}`, { state: { returnTo: '/properties' } });
          return;
        }
        setYad2Status({ step: 3, label: 'הנכס נסרק אך לא נשמר במאגר — נסה שוב', tone: 'error' });
      } catch (e: any) {
        setYad2Status({ step: 0, label: 'ייבוא מיד2 נכשל: ' + String(e?.message ?? 'שגיאה'), tone: 'error' });
      } finally {
        window.clearTimeout(slow);
        yad2InFlight.current = false;
        setSearching(false);
      }
      return;
    }
    if (url) {
      setQuickLinkSeed(raw);
      setAddOpen(true);
      return;
    }
    void runSearch(raw);
   }, [q, runSearch, navigate, queryClient, activeWorkspaceId, rememberSearch]);

  useEffect(() => {
    if (pendingHistoryQuery.current !== q) return;
    pendingHistoryQuery.current = null;
    void submitQuery(q);
  }, [q, submitQuery]);

  // Local rows navigate immediately. Starting a full source scrape here used
  // to compete with the detail query for bandwidth and backend capacity; the
  // detail page now performs enrichment only after its local text has painted.
  const handleSelect = async (r: UnifiedResult) => {
    if (r.localId) {
      navigate(`/properties/${r.localId}`, { state: { propertySnapshot: r, returnTo: '/properties' } });
      return;
    }
    setImportingKey(r.key);
    try {
      const importedId = await autoImportResult(r);
      void ensureFullPropertyImport(importedId, r.url ?? null).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['properties-search'] });
      navigate(`/properties/${importedId}`, {
        state: { propertySnapshot: { ...r, localId: importedId }, returnTo: '/properties' },
      });
    } catch (err: any) {
      console.warn('[Properties] property import failed', err);
      toast.error('פתיחת הנכס נכשלה: ' + (err?.message ?? 'שגיאה'));
    } finally {
      setImportingKey(null);
    }
  };

  const toggleSelectedListing = useCallback((id: string) => {
    setSelectedListingIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const confirmDeleteListings = useCallback(async () => {
    const ids = deleteTargetIds;
    if (!ids.length) return;
    try {
      await deleteListings.mutateAsync(ids);
      setResults((current) => current.filter((row) => !row.localId || !ids.includes(row.localId)));
      defaultPoolRef.current.clear();
      setSelectedListingIds((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setDeleteTargetIds([]);
      if (selectedListingIds.size <= ids.length) setMultiSelectMode(false);
      toast.success(ids.length > 1 ? `${ids.length} נכסים נמחקו` : 'הנכס נמחק');
    } catch (error) {
      toast.error('מחיקת הנכס נכשלה', { description: error instanceof Error ? error.message : undefined });
    }
  }, [deleteListings, deleteTargetIds, selectedListingIds.size]);

  const cityOptions = useMemo(() => {
    const cities = new Set<string>(CITY_OPTIONS as readonly string[]);
    results.forEach((r) => { if (r.city) cities.add(r.city); });
    return Array.from(cities);
  }, [results]);

  // Transaction-type toggle filters the rendered list instantly (the live
  // search re-runs in parallel through the effect below).
  const typeFiltered = useMemo(() => {
    // Blank / half-scraped rows never reach the screen.
    const relevant = results.filter(r => !!r.localId || isRelevantListing(r));
    const results_ = relevant.filter(r => (r.source !== 'homely' || homelyConnected) && (r.sources?.length ? r.sources : [r.source]).some(source => activeSources.includes(source)));
    const bySource = sourceFilter
      ? results_.filter((r) => (r.sources ?? [r.source]).includes(sourceFilter))
      : results_;
    const base = bySource;
    if (listingType === 'all') return base;
    const narrowed = base.filter((r) => r.listing_type === listingType);
    // Never let a toggle blank the table — keep the wider pool instead.
    return narrowed;
  }, [results, listingType, sourceFilter, activeSources, homelyConnected]);


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
    navigate(`/campaigns?tab=create&channel=facebook&properties=${id}&listing=${id}`, { state: returnState() });
  }, [navigate]);


  // Per-source count breakdown for the total-count dropdown.
  const sourceBreakdown = useMemo(() => {
    // Real, deduped counts of what the table actually holds per source.
    const buckets = new Map<string, number>();
    (completedResults ?? []).forEach((r) => {
      for (const s of (r.sources?.length ? r.sources : [r.source])) {
        if (!activeSources.includes(s)) continue;
        buckets.set(s, (buckets.get(s) ?? 0) + 1);
      }
    });
    const keys = new Set<string>([...Object.keys(sourceStatus).filter(s => activeSources.includes(s as PropertySource)), ...buckets.keys()]);
    return Array.from(keys).map((src) => {
      const info = sourceStatus[src];
      const rendered = buckets.get(src) ?? 0;
      return {
        key: src as PropertySource,
        // Rendered rows win — the status count is only a hint before dedupe.
        count: rendered,
        status: info?.status ?? 'ok',
        error: info?.error,
      };
    }).sort((a, b) => b.count - a.count);
  }, [sourceStatus, completedResults, activeSources]);

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
    <div className="p-3 sm:p-6 pt-0 space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden min-w-0" dir="rtl">
      <header className="text-right">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">נכסים</h1>
      </header>

      {/* Compact unified control bar */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="!mt-3">



        {/* Row 1 — source dots (left) + deal-type toggles (right) */}
        <div data-testid="property-filter-row" className="mb-2 flex items-center justify-between gap-2">
        <div role="group" aria-label="מקורות חיפוש" className="group/sources flex min-w-0 items-center gap-0">
          {availableSources.map(source => <Button key={source} variant="ghost" size="sm" aria-label={sourceLabel(source)} title={sourceLabel(source)} aria-pressed={activeSources.includes(source)} onClick={() => toggleSource(source)} className="h-8 min-w-0 gap-0 px-1 hover:bg-transparent hover:text-inherit">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${sourceDotClass(source)} ${activeSources.includes(source) ? 'opacity-100' : 'opacity-30'}`} />
            <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300 motion-reduce:transition-none group-hover/sources:max-w-28 group-hover/sources:ps-1.5 group-hover/sources:opacity-100 group-focus-within/sources:max-w-28 group-focus-within/sources:ps-1.5 group-focus-within/sources:opacity-100 group-data-[expanded=true]/sources:max-w-28 group-data-[expanded=true]/sources:ps-1.5 group-data-[expanded=true]/sources:opacity-100">{sourceLabel(source)}</span>
          </Button>)}
        </div>
        <div className="inline-flex shrink-0 items-center" role="group" aria-label="סוג עסקה">
          {(['rent', 'sale'] as const).map(t => { const active = listingType === 'all' || listingType === t; return <Button key={t} size="sm" variant="ghost" onClick={() => setListingType(current => current === 'all' ? (t === 'rent' ? 'sale' : 'rent') : current === t ? current : 'all')} aria-pressed={active} className={`h-8 gap-1.5 px-2 text-xs hover:bg-transparent hover:text-inherit focus-visible:bg-transparent ${active ? 'font-semibold text-foreground' : 'text-muted-foreground/60'}`}><span className={`h-2 w-2 rounded-full bg-success ${active ? 'opacity-100' : 'opacity-30'}`} />{LISTING_TYPE_LABELS_HE[t]}</Button>; })}
        </div>
        </div>

        {/* Row 2 — search field: [multi-select checkbox] [filter icon] [active filter words] [text] [go] */}
        <div className="flex min-w-0 items-start gap-2" dir="rtl">
          <div className="relative min-w-0 flex-1 rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            <div className="flex min-h-10 w-full items-center gap-2 p-1.5">
            {yad2Status?.tone === 'busy' && <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={cancelSearch}
              aria-label="בטל חיפוש"
              title="בטל חיפוש"
              className="order-last h-7 shrink-0 gap-1.5 px-3 text-xs"
            >
              <X className="h-3.5 w-3.5" />
              <span>בטל</span>
            </Button>}
<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  type="button"
                  aria-label="סינון מתקדם"
                  title="סינון מתקדם"
                  className={`inline-flex shrink-0 items-center justify-center h-7 w-7 rounded-md transition-colors ${filtersOpen || filterChips.length ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>

              {yad2Status?.tone !== 'busy' && filterChips.map((chip) => (
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
                value={yad2Status?.tone === 'busy' ? '' : q}
                readOnly={yad2Status?.tone === 'busy'}
                onFocus={() => setSuggestionsOpen(true)}
                onClick={() => setSuggestionsOpen(true)}
                 onBlur={() => setSuggestionsOpen(false)}
                  role="combobox" aria-autocomplete="list" aria-expanded={suggestionsOpen && (q.trim().length >= 2 ? suggestions.length > 0 : searchHistory.length > 0)} aria-controls={q.trim() ? 'inventory-suggestions' : 'search-history'} aria-activedescendant={suggestionIndex >= 0 ? `inventory-option-${suggestionIndex}` : undefined}
                 onChange={(e) => { const value = e.target.value; setSuggestionsOpen(true); setQ(value); if (/^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/(?:realestate\/item\/\S+|s\/\S+|share\/\S+)$/i.test(value.trim())) void submitQuery(value); }}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData('text');
                  if (/yad2\.co\.il\//i.test(pasted)) {
                    e.preventDefault();
                    const text = pasted.trim();
                    setQ(text);
                    void submitQuery(text);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setSuggestionsOpen(false); return; }
                   if (suggestionsOpen && suggestions.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setSuggestionIndex(current => e.key === 'ArrowDown' ? (current + 1) % suggestions.length : (current <= 0 ? suggestions.length - 1 : current - 1)); return; }
                   if (e.key === 'Enter') { e.preventDefault(); setSuggestionsOpen(false); if (suggestionIndex >= 0 && suggestions[suggestionIndex]) { void handleSelect(suggestions[suggestionIndex]); } else { void submitQuery(); } }
                  if (e.key === 'Backspace' && !q && filterChips.length) filterChips[filterChips.length - 1].clear();
                }}
                placeholder={yad2Status?.tone === 'busy' ? 'סורק פרטים…' : filterChips.length ? 'הוסף מילות חיפוש…' : 'חיפוש נכסים או הדבקת קישור יד2'}
                aria-label="חיפוש נכסים"
                className="h-7 min-w-0 flex-1 bg-transparent text-right text-sm outline-none placeholder:text-muted-foreground"
                dir="rtl"
               />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={!q.trim()}
                aria-label="חפש"
                title="חפש"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setSuggestionsOpen(false); void submitQuery(); }}
                className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:bg-transparent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <SearchIcon className="h-4 w-4" />
              </Button>

             </div>
            </div>
             {suggestionsOpen && !q.trim() && searchHistory.length > 0 && (
               <div id="search-history" role="listbox" aria-label="חיפושים קודמים" className="absolute inset-x-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
                 {searchHistory.map(entry => <Button key={entry} role="option" aria-selected={false} variant="ghost" onMouseDown={event => event.preventDefault()} onClick={() => { pendingHistoryQuery.current = entry; setQ(entry); setSuggestionsOpen(false); }} className="h-auto w-full justify-start gap-2 p-2 text-right"><RefreshCw className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 truncate" dir="auto">{entry}</span></Button>)}
               </div>
             )}
             {suggestionsOpen && q.trim().length >= 2 && !/yad2\.co\.il|https?:\/\//i.test(q) && yad2Status?.tone !== 'busy' && (
              <div id="inventory-suggestions" role="listbox" aria-label="נכסי המשרד" className="absolute inset-x-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
                {inventorySuggestions.isFetching ? <div role="status" className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />מחפש בנכסי המשרד…</div> : suggestions.length ? suggestions.map((row, index) => <Button key={row.key} id={`inventory-option-${index}`} role="option" aria-selected={suggestionIndex === index} variant="ghost" onMouseDown={event => event.preventDefault()} onClick={() => { setSuggestionsOpen(false); void handleSelect(row); }} className={`h-auto w-full justify-start gap-2 p-2 text-right ${suggestionIndex === index ? 'bg-accent text-accent-foreground' : ''}`}><MapPin className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block truncate">{row.address || row.title}</span><span className="block truncate text-xs text-muted-foreground">{[row.city, row.title].filter(Boolean).join(' · ')}</span></span>{row.price ? <span className="shrink-0 text-xs tabular-nums">{formatPrice(row.price)}</span> : null}</Button>) : <div className="p-3 text-sm text-muted-foreground">{inventorySuggestions.isError ? 'לא ניתן לטעון הצעות כרגע' : 'לא נמצאו נכסים במשרד'}</div>}
              </div>
            )}
            {yad2Status && (
              <div role="status" aria-live="polite" className={`min-w-0 border-t px-3 py-2 text-xs ${yad2Status.tone === 'error' ? 'border-destructive/30 text-destructive' : 'border-border text-muted-foreground'}`}>
                <div className="flex min-w-0 items-start gap-2">
                  {yad2Status.tone === 'busy' && <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" />}
                  <span className="min-w-0 flex-1 break-words leading-5">{yad2Status.label}</span>
                  {yad2Status.tone !== 'busy' && <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setYad2Status(null)} aria-label="סגירה"><X className="h-3.5 w-3.5" /></Button>}
                </div>
                {yad2Status.tone !== 'error' && <div role="progressbar" aria-label="התקדמות ייבוא יד2" aria-valuemin={0} aria-valuemax={4} aria-valuenow={yad2Status.step} className="mt-2 grid h-1 grid-cols-4 gap-1 overflow-hidden rounded-full bg-muted">{[1, 2, 3, 4].map(step => <span key={step} className={`h-full transition-colors duration-300 motion-reduce:transition-none ${step <= yad2Status.step ? 'bg-primary' : 'bg-muted'}`} />)}</div>}
              </div>
            )}
          </div>
            {!searching && yad2Status?.tone !== 'busy' && completedResults !== null && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost"
                    type="button"
                    className="mt-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 text-primary transition-colors hover:bg-primary/20"
                    aria-label="פירוט תוצאות לפי מקור"
                    title="פירוט תוצאות לפי מקור"
                  >
                    <Database className="h-3.5 w-3.5" />
                    {/* +4px vs the previous 10px badge → 14px = text-sm */}
                    <span className="text-sm font-bold tabular-nums leading-none">{completedResults.length}</span>
                  </Button>
              


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
                    <span className="tabular-nums">{completedResults.length}</span>
                  </DropdownMenuItem>

                </DropdownMenuContent>
              </DropdownMenu>
            )}




        </div>




        {/* Row 2 — actions: [view toggle] ⇢ opposite side ⇠ [sort] [total count + breakdown] */}
        <div data-testid="property-tools-row" className="flex flex-wrap items-center gap-2 mt-[10px]" dir="rtl">
          {/* Side A — sort + total-count dropdown */}
          <div className="flex items-center gap-0">
            <SelectModeToggle total={sortedResults.filter(row => row.localId).length} active={multiSelectMode} count={selectedListingIds.size} onSelectAll={() => setSelectedListingIds(new Set(sortedResults.flatMap(row => row.localId ? [row.localId] : [])))} onToggle={() => { setMultiSelectMode(current => !current); setSelectedListingIds(new Set()); }} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                   variant="ghost"
                  size="sm"
                   className="h-8 gap-1.5 border-0 bg-transparent text-xs shadow-none hover:bg-transparent hover:text-inherit"
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

            {/* Transaction type: הכל / להשכרה / למכירה — same toolbar row,
                between the results-count pill and the view toggle. */}
          </div>



          {/* Side B — single mutually-exclusive view switch */}
          <div className="ms-auto inline-flex items-center">
            <ViewModeSwitch isGrid={viewMode === 'grid'} onToggle={() => setViewMode(viewMode === 'grid' ? 'table' : 'grid')} />
          </div>
        </div>

        {multiSelectMode && <SelectAllRow total={new Set(sortedResults.flatMap(row => row.localId ? [row.localId] : [])).size} selected={sortedResults.filter(row => row.localId && selectedListingIds.has(row.localId)).length} onToggle={() => {
          const ids = [...new Set(sortedResults.flatMap(row => row.localId ? [row.localId] : []))];
          const all = ids.length > 0 && ids.every(id => selectedListingIds.has(id));
          setSelectedListingIds(current => { const next = new Set(current); ids.forEach(id => { if (all) next.delete(id); else next.add(id); }); return next; });
        }}>
          <QuickPublicPromotion ids={Array.from(selectedListingIds)} onPublished={markPublished} />
          <Button size="sm" variant="ghost" className="gap-1.5 text-destructive" onClick={() => setDeleteTargetIds(Array.from(selectedListingIds))}><Trash2 className="h-4 w-4" />מחיקת הנבחרים</Button>
        </SelectAllRow>}




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
                quickPromotion={(row) => row.localId ? <QuickPublicPromotion ids={[row.localId]} compact onPublished={markPublished} /> : null}
                selectionMode={multiSelectMode}
                selectedIds={selectedListingIds}
                onToggleSelected={toggleSelectedListing}
                onDelete={(result) => result.localId && setDeleteTargetIds([result.localId])}
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
                    quickPromotion={r.localId ? <QuickPublicPromotion ids={[r.localId]} compact onPublished={markPublished} /> : null}
                    selectionMode={multiSelectMode}
                    selected={Boolean(r.localId && selectedListingIds.has(r.localId))}
                    onToggleSelected={r.localId ? () => toggleSelectedListing(r.localId as string) : undefined}
                    onDelete={r.localId ? () => setDeleteTargetIds([r.localId as string]) : undefined}
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
      {homelyConnected && <HomelyBulkSyncDialog open={homelyBulkOpen} onOpenChange={setHomelyBulkOpen} onImported={runSearch} mode="properties" />}
      <ImportProgressDialog
        open={progressOpen}
        onOpenChange={setProgressOpen}
        steps={importSteps}
        onDone={() => { runSearch(); }}
      />
      <PropertyDeleteDialog
        count={deleteTargetIds.length}
        open={deleteTargetIds.length > 0}
        deleting={deleteListings.isPending}
        onOpenChange={(open) => { if (!open) setDeleteTargetIds([]); }}
        onConfirm={confirmDeleteListings}
      />
    </div>
  );
}

function ResultCard({
  result,
  importing,
  onSelect,
  onCampaign,
  selectionMode = false,
  selected = false,
  onToggleSelected,
  onDelete,
  quickPromotion,
}: {
  result: UnifiedResult;
  importing: boolean;
  onSelect: () => void;
  onCampaign?: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  onDelete?: () => void;
  quickPromotion?: React.ReactNode;
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
  const [expanded, setExpanded] = useExclusiveExpansion('property-gallery');
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
    <Card className="overflow-hidden flex flex-col group hover:shadow-lg transition-shadow cursor-pointer relative" onClick={selectionMode && onToggleSelected ? onToggleSelected : onSelect}>
      {selectionMode && onToggleSelected ? (
        <div className="absolute end-3 top-3 z-30" onClick={(event) => event.stopPropagation()}>
          <Checkbox checked={selected} onCheckedChange={onToggleSelected} aria-label="בחירת נכס" className="h-5 w-5 bg-background" />
        </div>
      ) : null}
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
          <Badge className={`absolute top-3 left-3 border z-10 ${isRent ? 'bg-sale text-sale-foreground border-transparent' : 'bg-success text-success-foreground border-transparent'}`}>
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
      <AnimatedExpansion open={hasMany && expanded}>
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
      </AnimatedExpansion>

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
            {onDelete && !selectionMode ? (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={onDelete} title="מחיקת נכס" aria-label="מחיקת נכס">
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
            {quickPromotion}
            <PropertyShareMenu results={[result]} />
            {result.localId ? <AffiliateCommissionButton listingId={result.localId} /> : null}
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


export function ResultTable({
  results,
  importingKey,
  onSelect,
  onCampaign,
  onAffiliate,
  affiliateCell,
  commissionCell,
  onEdit,
  propertyHref,
  hideDefaultActions = false,
  publishedAt,
  publishedLabel = 'תאריך פרסום/עדכון',
  showPropertyNotes = true,
  selectionMode = false,
  selectedIds,
  onToggleSelected,
  onDelete,
  quickPromotion,
  endActions,
}: {
  results: UnifiedResult[];
  importingKey: string | null;
  onSelect: (r: UnifiedResult) => void;
  onCampaign?: (r: UnifiedResult) => void;
  onAffiliate?: (r: UnifiedResult) => void;
  /** Affiliate status control, rendered as the first column when provided. */
  affiliateCell?: (r: UnifiedResult) => React.ReactNode;
  /** Commission summary, rendered right after the affiliate column. */
  commissionCell?: (r: UnifiedResult) => React.ReactNode;
  /** Full property editing, rendered as an extra action button. */
  onEdit?: (r: UnifiedResult) => void;
  /** Optional safe destination for rows rendered outside the owning workspace. */
  propertyHref?: (r: UnifiedResult) => string | null;
  /** Hide workspace-only campaign, share and edit controls. */
  hideDefaultActions?: boolean;
  affiliateSortValue?: (r: UnifiedResult) => string | number | null;
  commissionSortValue?: (r: UnifiedResult) => string | number | null;
  publishedAt?: (r: UnifiedResult) => string | null;
  publishedLabel?: string;
  /** Internal office notes must never render on partner-facing tables. */
  showPropertyNotes?: boolean;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelected?: (id: string) => void;
  onDelete?: (r: UnifiedResult) => void;
  quickPromotion?: (r: UnifiedResult) => React.ReactNode;
  /** Optional trailing actions, including on read-only partner tables. */
  endActions?: (r: UnifiedResult) => React.ReactNode;
}) {

  const { notesByListing } = usePropertyNotesByListing();
  // Publisher column only matters in partner mode: in broker mode every row
  // already belongs to the user's own workspace.
  const { isPartnerMode } = useAppMode();
  const showPublisherColumn = isPartnerMode;

  // Partner sharing lives in ONE unified first column. Saved properties get it
  // automatically; callers may override the cell with their own control.
  const localIds = useMemo(
    () => results.map((r) => r.localId).filter((id): id is string => !!id),
    [results],
  );
  const { data: affiliateConfigs } = useAffiliateConfigs(hideDefaultActions ? [] : localIds);
  const { data: publishers } = useListingPublishers(localIds);
  const renderAffiliate = affiliateCell
    ?? ((r: UnifiedResult) => (r.localId
      ? <AffiliateShareCell listingId={r.localId} config={affiliateConfigs?.get(r.localId)} />
      : null));
  // Reward amounts always sit in their own "עמלות" column, like the affiliate table.
  const renderCommission = commissionCell
    ?? ((r: UnifiedResult) => (r.localId ? <AffiliateTierPrices config={affiliateConfigs?.get(r.localId)} /> : null));
  const showAffiliateColumn = !!affiliateCell || (!hideDefaultActions && localIds.length > 0);
  const showCommissionColumn = !!commissionCell || (!hideDefaultActions && localIds.length > 0);
  const allSelected = localIds.length > 0 && localIds.every((id) => selectedIds?.has(id));

  // Sorting, column reorder and hide/show are handled by the shared Table
  // primitive (persisted per user/workspace/page). Cells that need numeric or
  // date sorting expose it via data-sort-value on their content.
  const sorted = results;

  // Plain element factory (NOT a component): the shared Table primitive clones
  // header cells with ref/sort/drag props, which function components swallow.
  const headerCell = (label: string, extraClass?: string) => (
    <th className={`px-2 py-2 font-semibold whitespace-nowrap select-none ${extraClass ?? ''}`}>
      {label}
    </th>
  );

  return (
    <Card className="max-w-full w-full min-w-0">
      <Table className="w-full min-w-max text-[15px]" dir="rtl">
        <thead className="bg-muted/50 sticky top-0">
          <tr className="text-right">
            {selectionMode && results.length > 0 ? (
              <th className="sticky right-0 z-10 w-10 bg-muted/95 px-3 py-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => localIds.forEach((id) => { if (allSelected || !selectedIds?.has(id)) onToggleSelected?.(id); })}
                  aria-label="בחירת כל הנכסים"
                />
              </th>
            ) : null}
            {showAffiliateColumn ? headerCell("שותפים") : null}
            {showCommissionColumn ? headerCell("עמלות") : null}
            {showPublisherColumn ? headerCell("משרד מפרסם") : null}
            {headerCell("תמונה", "w-14")}

            {headerCell("רחוב")}
            {/* Internal-only: house & apartment numbers never leave the workspace. */}
            {headerCell("בית")}
            {headerCell("דירה")}
            {headerCell("שכונה")}
            {headerCell("סוג")}
            {headerCell("מחיר")}
            {headerCell("עיר")}
            {headerCell("חדרים")}
            {headerCell('מ"ר')}
            {headerCell("תמונות")}
            {headerCell(publishedLabel)}
            {!hideDefaultActions || endActions ? <th className="px-2 py-2 font-semibold whitespace-nowrap text-left">פעולה</th> : null}


          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const isRent = r.listing_type === 'rent';
            const importing = importingKey === r.key;
            const rowNotes = showPropertyNotes && r.localId ? notesByListing.get(r.localId) : undefined;
            return (
              <Fragment key={r.key}>
              <tr className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => selectionMode && r.localId && onToggleSelected ? onToggleSelected(r.localId) : onSelect(r)}>
                {selectionMode && results.length > 0 ? (
                  <td className="sticky right-0 z-10 bg-background px-3 py-1.5" onClick={(event) => event.stopPropagation()}>
                    {r.localId ? <Checkbox checked={selectedIds?.has(r.localId)} onCheckedChange={() => onToggleSelected?.(r.localId as string)} aria-label="בחירת נכס" /> : null}
                  </td>
                ) : null}
                {showAffiliateColumn ? (
                  <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>{renderAffiliate(r)}</td>
                ) : null}
                {showCommissionColumn ? (
                  <td className="px-2 py-1.5 whitespace-nowrap text-xs" onClick={(e) => e.stopPropagation()}>{renderCommission(r)}</td>
                ) : null}
                {showPublisherColumn ? (
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {(() => {
                    const pub = r.localId ? publishers?.get(r.localId) : undefined;
                    if (!pub) return <span className="text-muted-foreground">—</span>;
                    return (
                      <span className="inline-flex max-w-[11rem] items-center gap-1.5">
                        {pub.logo ? (
                          <img src={pub.logo} alt="" loading="lazy" className="h-6 w-6 shrink-0 rounded-md border border-border/60 bg-background object-contain" />
                        ) : (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">{pub.name.slice(0, 1)}</span>
                        )}
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate text-sm" title={pub.name}>{pub.name}</span>
                          {pub.userName && pub.userName !== pub.name ? <span className="truncate text-[11px] text-muted-foreground" title={pub.userName}>{pub.userName}</span> : null}
                        </span>
                      </span>
                    );
                  })()}
                </td>
                ) : null}
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
                    const destination = propertyHref?.(r) ?? (propertyHref ? null : r.localId ? `/properties/${r.localId}` : null);
                    const link = destination
                      ? <Link to={destination} state={{ propertySnapshot: r }} className="hover:underline" onClick={(e) => e.stopPropagation()} title={label}>{label}</Link>
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
                <td className="px-2 py-1.5 whitespace-nowrap tabular-nums"><span data-sort-value={Number(houseNumberOf({ address: r.address, raw: r.raw })) || ''}>{houseNumberOf({ address: r.address, raw: r.raw }) || '—'}</span></td>
                <td className="px-2 py-1.5 whitespace-nowrap tabular-nums"><span data-sort-value={Number(apartmentNumberOf({ address: r.address, raw: r.raw })) || ''}>{apartmentNumberOf({ address: r.address, raw: r.raw }) || '—'}</span></td>
                <td className="px-2 py-1.5 whitespace-nowrap max-w-[10rem] truncate">{neighborhoodOf(r) || '—'}</td>
                <td className={`px-2 py-1.5 whitespace-nowrap text-xs font-bold ${isRent ? 'text-[#f59e0b]' : 'text-success'}`}>{LISTING_TYPE_LABELS_HE[r.listing_type]}</td>
                <td className={`px-2 py-1.5 whitespace-nowrap font-semibold ${isRent ? 'text-[#f59e0b]' : 'text-success'}`}><span data-sort-value={typeof r.price === 'number' ? r.price : ''}>{r.price ? formatPrice(r.price) : '—'}</span></td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.city || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap"><span data-sort-value={r.rooms ?? ''}>{r.rooms ?? '—'}</span></td>
                <td className="px-2 py-1.5 whitespace-nowrap"><span data-sort-value={r.size_sqm ?? ''}>{r.size_sqm ?? '—'}</span></td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {(() => {
                    // Total images on the SOURCE ad, even before any import.
                    const total = sourcePhotoCount(r, r.photos?.length ?? 0);
                    if (!total) return <span className="text-muted-foreground">—</span>;
                    return (
                      <span
                        data-sort-value={total}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground/80"
                        title={`${total} תמונות במודעת המקור`}
                      >
                        <ImageIcon className="h-3.5 w-3.5 opacity-70" />
                        {total}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap tabular-nums text-muted-foreground">
                  <span data-sort-value={publishedAt?.(r) ?? listingPublishedAt(r) ?? listingActivityAt(r) ?? ''}>
                    {publishedAt ? (publishedAt(r) ? new Date(String(publishedAt(r))).toLocaleDateString('he-IL') : '—') : <ListingDateCell row={r} />}
                  </span>
                </td>

                {!hideDefaultActions || endActions ? <td className="px-2 py-1.5 whitespace-nowrap text-left" onClick={(e) => e.stopPropagation()}>
                  {endActions?.(r)}
                  {quickPromotion?.(r)}
                  {!hideDefaultActions && <PropertyRowActions r={r} importing={importing} onCampaign={(x) => (onCampaign ? onCampaign(x) : onSelect(x))} onEdit={onEdit} onDelete={onDelete} onAffiliate={onAffiliate} hideAffiliate={showAffiliateColumn} />}
                </td> : null}


              </tr>
              {rowNotes && rowNotes.length > 0 && (
                <tr className="border-t-0 bg-muted/20">
                  <td className="px-2 pb-2" colSpan={30}>
                    <PropertyNotesBlock notes={rowNotes} />
                  </td>
                </tr>
              )}
              </Fragment>
            );

          })}
        </tbody>
      </Table>
    </Card>
  );
}

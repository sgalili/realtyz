import { useEffect, useMemo, useState, useCallback } from 'react';
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
  Send, BedDouble, Ruler, MapPin, Building2, FileSpreadsheet, LayoutGrid,
  SlidersHorizontal, ArrowRight, Loader2, Search as SearchIcon,
  ArrowUpDown, Database,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { SourceBadge, sourceLabel } from '@/components/properties/SourceBadge';
import { searchAllSources, type UnifiedResult, type SearchFilters } from '@/lib/propertySearch';
import { autoImportResult } from '@/lib/propertyAutoImport';
import { stripAddressNumbers } from '@/lib/formatAddress';

const PRICE_MIN = 0;
const PRICE_MAX = 10_000_000;
const PRICE_STEP = 100_000;
const CACHE_KEY = 'properties:last-search:v1';

function formatPrice(n: number) {
  return `₪${n.toLocaleString('he-IL')}`;
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
  const cached = useMemo(() => loadCache(), []);

  const [q, setQ] = useState<string>(cached?.q ?? '');
  const [listingType, setListingType] = useState<ListingType | 'all'>(cached?.listingType ?? 'all');
  const [city, setCity] = useState<string>(cached?.city ?? 'כל הערים');
  const [propertyType, setPropertyType] = useState<PropertyType | 'all'>(cached?.propertyType ?? 'all');
  const [rooms, setRooms] = useState<string>(cached?.rooms ?? 'any');
  const [maxPrice, setMaxPrice] = useState<number>(cached?.maxPrice ?? PRICE_MAX);
  const [areaMin, setAreaMin] = useState<string>(cached?.areaMin ?? '');

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'price_asc' | 'price_desc' | 'rooms_desc' | 'size_desc' | 'newest'>('relevance');

  const [results, setResults] = useState<UnifiedResult[]>(cached?.results ?? []);
  const [sourceStatus, setSourceStatus] = useState<Record<string, { status: string; count: number; error?: string }>>({});
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState<boolean>(!!cached?.results?.length);
  const [importingKey, setImportingKey] = useState<string | null>(null);

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

  const runSearch = useCallback(async () => {
    setSearching(true);
    setHasSearched(true);
    try {
      const filters: SearchFilters = {
        q: q.trim() || undefined,
        city: city && city !== 'כל הערים' && city !== '__my_zones__' ? city : undefined,
        max_price: maxPrice < PRICE_MAX ? maxPrice : undefined,
        rooms: rooms !== 'any' ? Number(rooms) : undefined,
        listing_type: listingType,
        min_sqm: areaMin ? Number(areaMin) : undefined,
        property_type: propertyType !== 'all' ? propertyType : undefined,
      };
      const resp = await searchAllSources(filters);
      // Property type filter (external sources ignore this)
      let filtered = resp.results;
      if (propertyType !== 'all') {
        filtered = filtered.filter((r) => !r.property_type || String(r.property_type).toLowerCase() === propertyType);
      }
      setResults(filtered);
      setSourceStatus(resp.sources);
      saveCache({ q, listingType, city, propertyType, rooms, maxPrice, areaMin, results: filtered.slice(0, 100) });
      const errored = Object.entries(resp.sources).filter(([, v]) => v.status === 'error');
      if (errored.length) {
        toast.info(`חלק מהמקורות לא זמינים: ${errored.map(([k]) => sourceLabel(k as any)).join(', ')}`);
      }
    } catch (err: any) {
      console.error('[Properties] search failed', err);
      toast.error('חיפוש נכשל: ' + (err?.message ?? 'שגיאה לא ידועה'));
    } finally {
      setSearching(false);
    }
  }, [q, listingType, city, propertyType, rooms, maxPrice, areaMin]);

  // When the user commits a URL (Yad2) in the search box, hand off to
  // the quick-import flow via AddPropertyDialog.
  const submitQuery = useCallback(() => {
    const raw = q.trim();
    if (/^https?:\/\/\S+/i.test(raw)) {
      setQuickLinkSeed(raw);
      setAddOpen(true);
      return;
    }
    runSearch();
  }, [q, runSearch]);

  const handleSelect = async (r: UnifiedResult) => {
    if (r.localId) { navigate(`/properties/${r.localId}`); return; }
    setImportingKey(r.key);
    try {
      const id = await autoImportResult(r);
      toast.success('יובא אוטומטית למאגר');
      queryClient.invalidateQueries({ queryKey: ['properties-search'] });
      navigate(`/properties/${id}`);
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

  const sortedResults = useMemo(() => {
    const arr = [...results];
    const numOr = (v: number | null | undefined, fallback: number) => (typeof v === 'number' && !Number.isNaN(v) ? v : fallback);
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
        return arr.sort((a, b) => String(b.updated_at ?? b.created_at ?? '').localeCompare(String(a.updated_at ?? a.created_at ?? '')));
      default:
        return arr;
    }
  }, [results, sortBy]);

  // Per-source count breakdown for the total-count dropdown.
  const sourceBreakdown = useMemo(() => {
    // Prefer the fan-out status (accurate raw counts before dedupe/text filter).
    const fromStatus = Object.entries(sourceStatus).map(([src, info]) => ({
      key: src as any,
      count: info.count,
      status: info.status,
      error: info.error,
    }));
    if (fromStatus.length) return fromStatus;
    // Fallback: count the rendered results by their assigned source.
    const buckets = new Map<string, number>();
    results.forEach((r) => buckets.set(r.source, (buckets.get(r.source) ?? 0) + 1));
    return Array.from(buckets.entries()).map(([key, count]) => ({ key: key as any, count, status: 'ok' as const, error: undefined }));
  }, [sourceStatus, results]);

  const SORT_LABELS: Record<typeof sortBy, string> = {
    relevance: 'רלוונטיות',
    price_asc: 'מחיר: נמוך לגבוה',
    price_desc: 'מחיר: גבוה לנמוך',
    rooms_desc: 'הכי הרבה חדרים',
    size_desc: 'הכי גדול (מ״ר)',
    newest: 'החדשים ביותר',
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden min-w-0" dir="rtl">
      <header className="text-right">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">נכסים</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          חיפוש מאוחד — הומלי, יד-2 והמאגר שלך במקום אחד. לחיצה על תוצאה מייבאת אותה אוטומטית.
        </p>
      </header>

      {/* Compact unified control bar */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        {/* Row 1 — search: [advanced filter icon] [search input with go button] */}
        <div className="flex items-center gap-2" dir="rtl">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-10 w-10 shrink-0"
              aria-label="סינון מתקדם"
              title="סינון מתקדם"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>

          <div className="relative flex-1 min-w-[200px]">
            <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitQuery(); } }}
              placeholder="חיפוש נכסים"
              aria-label="חיפוש נכסים"
              className="h-10 text-right pr-10 pl-11 text-sm"
              dir="rtl"
            />
            <Button
              type="button"
              size="icon"
              onClick={submitQuery}
              disabled={searching}
              aria-label="חיפוש"
              title="חיפוש"
              className="absolute left-1 top-1/2 -translate-y-1/2 h-8 w-8"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Row 2 — actions: [view toggle] ⇢ opposite side ⇠ [sort] [total count + breakdown] */}
        <div className="flex items-center gap-2 mt-3" dir="rtl">
          {/* Side A — view toggle */}
          <div className="inline-flex rounded-md border border-border bg-card/50 p-0.5" role="group" aria-label="מצב תצוגה">
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

          {/* Side B — pushed to the opposite side: sort + total-count dropdown */}
          <div className="ms-auto flex items-center gap-2">
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
                    return (
                      <DropdownMenuItem
                        key={row.key}
                        className="text-xs justify-between gap-3"
                        title={row.error ?? undefined}
                      >
                        <span className="flex items-center gap-2">
                          <SourceBadge source={row.key} compact />
                          <span>{sourceLabel(row.key)}</span>
                        </span>
                        <span className={`font-bold tabular-nums ${isError ? 'text-destructive' : ''}`}>
                          {isError ? '!' : row.count}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-xs justify-between gap-3 font-semibold">
                    <span>סה״כ (לאחר איחוד)</span>
                    <span className="tabular-nums">{results.length}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>



        <CollapsibleContent>
          <Card className="p-4 sm:p-5 mt-3">
            {/* Deal type toggle — Sale / Rent / All */}
            <div className="flex items-center justify-between mb-4">
              <Label className="text-xs font-semibold">סוג עסקה</Label>
              <div className="inline-flex items-center rounded-md border border-primary/20 bg-card/40 p-0.5" dir="rtl">
                {(['all', 'sale', 'rent'] as Array<ListingType | 'all'>).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setListingType(t)}
                    className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                      listingType === t ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t === 'all' ? 'הכל' : LISTING_TYPE_LABELS_HE[t]}
                  </button>
                ))}
              </div>
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
                <Button size="sm" className="h-10 flex-1" onClick={runSearch} disabled={searching}>
                  החל
                </Button>
              </div>
            </div>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Results */}
      <ErrorBoundary source="Properties.Results">
        {!hasSearched ? (
          <Card className="p-12 text-center text-muted-foreground">
            <SearchIcon className="mx-auto h-8 w-8 mb-3 opacity-40" />
            <div className="text-base font-semibold text-foreground mb-1">חפש נכס מכל המקורות</div>
            <div className="text-sm">הזן עיר, כתובת או קישור — נחפש בו-זמנית במאגר שלך, בהומלי וביד-2.</div>
          </Card>
        ) : searching ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-full rounded-lg" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            לא נמצאו נכסים תואמים. נסה חיפוש רחב יותר.
          </Card>
        ) : viewMode === 'table' ? (
          <ResultTable results={results} importingKey={importingKey} onSelect={handleSelect} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((r) => (
              <ResultCard key={r.key} result={r} importing={importingKey === r.key} onSelect={() => handleSelect(r)} />
            ))}
          </div>
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
    </div>
  );
}

function ResultCard({ result, importing, onSelect }: { result: UnifiedResult; importing: boolean; onSelect: () => void }) {
  const photo = result.photos?.[0];
  const isRent = result.listing_type === 'rent';
  return (
    <Card className="overflow-hidden flex flex-col group hover:shadow-lg transition-shadow cursor-pointer relative" onClick={onSelect}>
      <div className="aspect-[16/10] bg-muted relative overflow-hidden">
        {photo ? (
          <img src={photo} alt={result.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">אין תמונה</div>
        )}
        <div className="absolute top-3 right-3">
          <SourceBadge source={result.source} />
        </div>
        {result.listing_type && (
          <Badge className={`absolute top-3 left-3 border ${isRent ? 'bg-[#0b3982] text-white border-[#0b3982]' : 'bg-primary text-primary-foreground'}`}>
            {LISTING_TYPE_LABELS_HE[result.listing_type]}
          </Badge>
        )}
        {importing && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Loader2 className="h-4 w-4 animate-spin" /> מייבא למאגר…
            </div>
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <h3 className="font-semibold text-base leading-tight line-clamp-2">{result.title}</h3>
        {result.description && <p className="text-xs text-muted-foreground line-clamp-2">{result.description}</p>}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {result.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {result.city}</span>}
          {result.rooms ? <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" /> {result.rooms} חד'</span> : null}
          {result.size_sqm ? <span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5" /> {result.size_sqm} מ"ר</span> : null}
        </div>

        <div className="flex items-center justify-between mt-auto pt-2 border-t gap-2 flex-wrap">
          <div className="text-lg font-bold text-success inline-flex items-center gap-1">
            <Building2 className="h-4 w-4 opacity-60" />
            {result.price
              ? (<>{formatPrice(result.price)}{isRent ? <span className="text-xs font-normal text-muted-foreground">/חודש</span> : null}</>)
              : (<span className="text-sm font-semibold text-amber-600">פרטים חסרים</span>)}
          </div>
          <Button size="sm" onClick={(e) => { e.stopPropagation(); onSelect(); }} className="gap-1.5">
            <Send className="h-4 w-4" />
            {result.localId ? 'פתח' : 'ייבא ופתח'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ResultTable({ results, importingKey, onSelect }: { results: UnifiedResult[]; importingKey: string | null; onSelect: (r: UnifiedResult) => void }) {
  return (
    <Card className="overflow-x-auto max-w-full w-full">
      <table className="w-full text-[15px]" dir="rtl">
        <thead className="bg-muted/50 sticky top-0">
          <tr className="text-right">
            <th className="px-2 py-2 font-semibold whitespace-nowrap">מקור</th>
            <th className="px-2 py-2 font-semibold whitespace-nowrap">שם</th>
            <th className="px-2 py-2 font-semibold whitespace-nowrap">סוג</th>
            <th className="px-2 py-2 font-semibold whitespace-nowrap">מחיר</th>
            <th className="px-2 py-2 font-semibold whitespace-nowrap">עיר</th>
            <th className="px-2 py-2 font-semibold whitespace-nowrap">רחוב</th>
            <th className="px-2 py-2 font-semibold whitespace-nowrap">חדרים</th>
            <th className="px-2 py-2 font-semibold whitespace-nowrap">מ"ר</th>
            <th className="px-2 py-2 font-semibold whitespace-nowrap text-left">פעולה</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const isRent = r.listing_type === 'rent';
            const importing = importingKey === r.key;
            return (
              <tr key={r.key} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(r)}>
                <td className="px-2 py-1.5"><SourceBadge source={r.source} compact /></td>
                <td className="px-2 py-1.5 max-w-[220px] truncate">
                  {r.localId ? <Link to={`/properties/${r.localId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{r.title}</Link> : r.title}
                </td>
                <td className={`px-2 py-1.5 whitespace-nowrap text-xs font-bold ${isRent ? 'text-[#f59e0b]' : 'text-success'}`}>{LISTING_TYPE_LABELS_HE[r.listing_type]}</td>
                <td className={`px-2 py-1.5 whitespace-nowrap font-semibold ${isRent ? 'text-[#f59e0b]' : 'text-success'}`}>{r.price ? formatPrice(r.price) : '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.city || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap max-w-[180px] truncate">{stripAddressNumbers(r.address ?? '') || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.rooms ?? '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.size_sqm ?? '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap text-left">
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onSelect(r); }} className="gap-1.5" disabled={importing}>
                    {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {r.localId ? 'פתח' : 'ייבא'}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

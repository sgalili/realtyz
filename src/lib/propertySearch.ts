// Unified multi-source property search.
// Fans out to local DB + every configured external source (Homely, Yad2)
// in parallel and returns a normalized, deduped result set that the UI renders
// as one list with per-row source badges.

import { supabase } from '@/integrations/supabase/client';
import { normalizeImageUrls } from '@/lib/imageHealth';
import type { PropertySource } from '@/components/properties/SourceBadge';

export type UnifiedResult = {
  key: string;                 // stable client-side id
  source: PropertySource;      // primary source (local wins when merged)
  sources: PropertySource[];   // every source this listing was found in
  localId: string | null;      // listings.id when the row is (or already exists) locally
  title: string;
  description?: string | null;
  price: number | null;
  city: string | null;
  address: string | null;
  neighborhood?: string | null;
  rooms: number | null;
  size_sqm: number | null;
  floor?: number | null;
  photos: string[];
  url: string | null;          // external source URL when applicable
  listing_type: 'sale' | 'rent';
  property_type: string | null;
  raw?: any;
  updated_at?: string | null;
  created_at?: string | null;
};

export type SearchFilters = {
  q?: string;
  city?: string | null;
  neighborhood?: string | null;
  min_price?: number | null;
  max_price?: number | null;
  rooms?: number | null;
  listing_type?: 'sale' | 'rent' | 'all';
  min_sqm?: number | null;
  property_type?: string | null;
};

export type SourceStatus = 'ok' | 'empty' | 'unavailable' | 'error';
export type SearchProgress = { done: number; total: number; loaded: number; pending: string[] };
export type SearchResponse = {
  results: UnifiedResult[];
  sources: Record<string, { status: SourceStatus; count: number; error?: string }>;
  progress?: SearchProgress;
};

function normPhone(price: unknown): number | null {
  const n = Number(price);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function inferListingType(price: number | null, hint?: string | null): 'sale' | 'rent' {
  const s = String(hint ?? '').toLowerCase();
  if (/rent|שכירות|להשכרה|שכר/.test(s)) return 'rent';
  if (/sale|למכירה|מכירה/.test(s)) return 'sale';
  if (price && price > 0 && price < 50_000) return 'rent';
  return 'sale';
}

function dedupeKey(r: Pick<UnifiedResult, 'city' | 'address' | 'rooms' | 'price' | 'title'>): string {
  return [r.city, r.address, r.title, r.rooms, r.price]
    .map((v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase())
    .join('|');
}

/** Human-readable Hebrew reason for a Yad2 gateway failure. */
function friendlyYad2Error(raw: string): string {
  const s = raw.toLowerCase();
  if (/non-2xx|546|worker_resource_limit|memory/.test(s)) return 'שירות יד-2 עמוס כרגע — נסה שוב בעוד רגע';
  if (/timeout|idle_timeout|504/.test(s)) return 'יד-2 לא הגיב בזמן';
  if (/suspend|billing|402/.test(s)) return 'חשבון הגישה ליד-2 אינו פעיל';
  if (/zone|misconfigured|kyc|policy_20140|403/.test(s)) return 'הגישה ליד-2 דרך Bright Data נחסמה זמנית — נסה שוב';
  if (/429|rate/.test(s)) return 'יותר מדי בקשות ליד-2 — נסה שוב בקרוב';
  return raw.slice(0, 120);
}


function tokenize(q: string | null | undefined): string[] {
  return String(q ?? '')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 6);
}

export async function searchLocalListings(f: SearchFilters): Promise<UnifiedResult[]> {
  return searchLocal(f);
}

async function searchLocal(f: SearchFilters): Promise<UnifiedResult[]> {
  let q = supabase
    .from('listings')
    .select('id, property_title, description, short_description, long_description, available_from, attributes, house_number, apartment_number, asking_price, deal_type, city, address, neighborhood, rooms, sqm, floor, features, source_metadata, source, source_url, media_photos, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(200);

  // Tokenize free-text so "דירה בהרצליה 4 חדרים" matches on any word,
  // not the whole phrase. Each token must appear in at least one text field.
  const tokens = tokenize(f.q);
  for (const t of tokens) {
    const like = `%${t}%`;
    q = q.or(
      `property_title.ilike.${like},address.ilike.${like},city.ilike.${like},neighborhood.ilike.${like},description.ilike.${like}`,
    );
  }
  if (f.city && f.city !== 'כל הערים') q = q.eq('city', f.city);
  if (f.min_price != null) q = q.gte('asking_price', f.min_price);
  if (f.max_price != null) q = q.lte('asking_price', f.max_price);
  if (f.rooms != null) q = q.gte('rooms', f.rooms);
  if (f.min_sqm != null) q = q.gte('sqm', f.min_sqm);

  const { data, error } = await q;
  if (error) {
    console.error('[propertySearch] local listings query failed', error);
    throw error;
  }

  return (data ?? []).map((row: any): UnifiedResult => {
    const meta = row.source_metadata && typeof row.source_metadata === 'object' ? row.source_metadata : {};
    // Keep the upstream provenance visible: a row scraped from Yad2 stays
    // badged as Yad2 even after it is hydrated locally, so the source counter
    // reflects where the property actually came from.
    const origin = String(row.source ?? (meta as any)?.source_origin ?? '').toLowerCase();
    const source: PropertySource = origin === 'yad2' ? 'yad2' : origin === 'homely' ? 'homely' : 'mine';

    const price = normPhone(row.asking_price);
    return {
      key: `local:${row.id}`,
      source,
      sources: [source],
      localId: row.id,
      title: row.property_title || 'נכס',
      description: row.long_description ?? row.description ?? row.short_description ?? null,
      price,
      city: row.city ?? null,
      address: row.address ?? row.neighborhood ?? null,
      neighborhood: row.neighborhood ?? null,
      rooms: row.rooms != null ? Number(row.rooms) : null,
      size_sqm: row.sqm != null ? Number(row.sqm) : null,
      floor: row.floor != null ? Number(row.floor) : null,
      photos: normalizeImageUrls(Array.isArray(row.media_photos) ? row.media_photos.filter((p: any) => typeof p === 'string') : []),
      url: row.source_url ?? meta.source_url ?? null,
      listing_type: inferListingType(price, row.deal_type ?? meta.transaction_type ?? meta.listing_type ?? meta.deal_type),
      property_type: (meta as any).property_type ?? (row.attributes as any)?.property_type ?? (row.attributes as any)?.subcategory ?? null,
      updated_at: row.updated_at ?? null,
      created_at: row.created_at ?? null,
      raw: row,
    };
  });
}

async function invokeExternal(fn: string, body: any) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw error;
  return data;
}

function normalizeExternal(source: PropertySource, items: any[]): UnifiedResult[] {
  return items.map((it, idx): UnifiedResult => {
    const price = normPhone(it.price ?? it.asking_price);
    return {
      key: `${source}:${it.id ?? it.source_url ?? it.url ?? idx}`,
      source,
      sources: [source],
      localId: null,
      title: it.title || it.property_title || 'נכס',
      description: it.description ?? null,
      price,
      city: it.city ?? null,
      address: it.address ?? null,
      neighborhood: it.neighborhood ?? null,
      rooms: it.rooms != null ? Number(it.rooms) : null,
      size_sqm: it.size_sqm != null ? Number(it.size_sqm) : it.sqm != null ? Number(it.sqm) : null,
      floor: it.floor != null ? Number(it.floor) : null,
      photos: Array.isArray(it.photos) ? normalizeImageUrls(it.photos) : [],
      url: it.url ?? it.source_url ?? null,
      listing_type: inferListingType(price, it.listing_type ?? it.transaction_type),
      property_type: it.property_type ?? null,
      raw: it,
    };
  });
}

export async function searchAllSources(
  f: SearchFilters,
  // Called the instant the LOCAL database results are ready, so the UI can
  // paint matches from `listings` without waiting on any external gateway.
  onPartial?: (partial: SearchResponse) => void,
): Promise<SearchResponse> {
  const sources: SearchResponse['sources'] = {};
  const listingType = f.listing_type && f.listing_type !== 'all' ? f.listing_type : undefined;
  const body = {
    q: f.q ?? undefined,
    city: f.city && f.city !== 'כל הערים' ? f.city : undefined,
    neighborhood: f.neighborhood ?? undefined,
    min_price: f.min_price ?? undefined,
    max_price: f.max_price ?? undefined,
    rooms: f.rooms ?? undefined,
    listing_type: listingType,
    deal_type: listingType,
    limit: 30,
  };

  const homelyFilters = {
    // Server-side filters accepted by `homely-fetch-property` (the same
    // action the "Sync with Homely" dialog uses — that call yields ~1040
    // properties, so we align the main /properties search with it here).
    search: f.q ?? '',
    cities: f.city && f.city !== 'כל הערים' ? [f.city] : [],
    rooms: f.rooms != null ? String(f.rooms) : '',
    type: '',
    agent: '',
    deal: listingType ?? 'all',
  };
  const homelyHasFilter = Boolean(
    homelyFilters.search.trim() ||
      homelyFilters.cities.length ||
      homelyFilters.rooms ||
      (homelyFilters.deal && homelyFilters.deal !== 'all'),
  );

  // Paint the free local database first. External sources then run in
  // parallel so a slow Yad2 request can never hold back Homely results.
  const localTask = () =>
    searchLocal(f)

      .then((r) => {
        sources.mine = { status: r.length ? 'ok' : 'empty', count: r.length };
        return { label: 'mine' as const, results: r };
      })
      .catch((e) => {
        console.error('[propertySearch] local source failed', e);
        sources.mine = { status: 'error', count: 0, error: String(e?.message ?? e) };
        return { label: 'mine' as const, results: [] };
      });

  const homelyTask = () =>
    invokeExternal('homely-fetch-property', {

      action: homelyHasFilter ? 'searchProperties' : 'fetchAllProperties',
      filters: homelyFilters,
    })
      .then((d: any) => {
        const items = Array.isArray(d?.properties) ? d.properties : [];
        const normalized: UnifiedResult[] = items.map((p: any, idx: number): UnifiedResult => {
          const photos = Array.isArray(p.photos) ? p.photos.filter((s: any) => typeof s === 'string') : [];
          const price = normPhone(p.price);
          const address = [p.address, p.street, p.number].filter(Boolean).join(' ').trim() || p.address || null;
          return {
            key: `homely:${p.homely_id ?? p.id ?? idx}`,
            source: 'homely',
            sources: ['homely'],
            localId: null,
            title: p.title || 'נכס',
            description: p.description ?? null,
            price,
            city: p.city ?? null,
            address,
            neighborhood: p.neighborhood ?? null,
            rooms: p.rooms != null ? Number(p.rooms) : null,
            size_sqm: p.sqm != null ? Number(p.sqm) : null,
            floor: p.floor != null ? Number(p.floor) : null,
            photos: normalizeImageUrls(photos),
            url: p.url ?? null,
            listing_type: inferListingType(price, p.transaction_type ?? p.listing_type ?? p.deal_type),
            property_type: p.property_type ?? null,
            raw: p,
          };
        });
        return { label: 'homely' as const, results: normalized };
      })
      .catch((e) => {
        console.error('[propertySearch] homely-fetch-property failed', e);
        sources.homely = { status: 'error', count: 0, error: String(e?.message ?? e) };
        return { label: 'homely' as const, results: [] };
      });

  const yad2Task = () =>
    (async () => {
      // Yad2 runs as the SECOND stage — a live fetch against the
      // yad2-unlocker edge function (gw.yad2.co.il / www.yad2.co.il via
      // Bright Data). It never falls back to Homely or Webtiv.

      const queryText = [f.q, f.city && f.city !== 'כל הערים' ? f.city : null, f.neighborhood]
        .filter(Boolean)
        .join(' ')
        .trim();
      const hasStructured = Boolean(body.city || body.rooms || body.min_price || body.max_price);
      if (!queryText && !hasStructured) {
        sources.yad2 = { status: 'empty', count: 0 };
        return { label: 'yad2' as const, results: [] };
      }
      try {
        const d: any = await invokeExternal('yad2-unlocker', {
          ...body,
          query: queryText || undefined,
          mode: 'search',
          // Kept deliberately small: the edge worker has a hard memory
          // budget, and every extra page burns BrightData credits.
          limit: 40,
          pages: 1,
        });

        if (Array.isArray(d?.diagnostics) && d.diagnostics.length) {
          console.info('[propertySearch] yad2-unlocker diagnostics', d.diagnostics);
        }
        // Soft failures come back as HTTP 200 with { error, results: [] } so the
        // other sources keep streaming. Record the reason, don't throw.
        if (d?.error) {
          sources.yad2 = { status: 'error', count: 0, error: friendlyYad2Error(String(d.detail || d.error)) };
          return { label: 'yad2' as const, results: [] };
        }
        const items = Array.isArray(d?.results) ? d.results : Array.isArray(d?.items) ? d.items : [];
        return { label: 'yad2' as const, results: normalizeExternal('yad2', items) };

      } catch (e: any) {
        const msg = String(e?.message ?? e);
        console.error('[propertySearch] yad2-unlocker failed', e);
        sources.yad2 = { status: 'error', count: 0, error: friendlyYad2Error(msg) };
        return { label: 'yad2' as const, results: [] };
      }
    })();

  // NOTE: `webtiv-homely-sync` is a CONTACT sync job (buyers/sellers → Homely),
  // not a property search endpoint, so the office's Webtiv inventory is served
  // through `homely-fetch-property` (same AutomaionJson stream, sale AND rent).
  // Merge + dedupe + text-filter a set of settled source buckets.
  const mergeSettled = (buckets: Array<{ label: PropertySource; results: UnifiedResult[] }>) => {
    const all: UnifiedResult[] = [];
    const byKey = new Map<string, number>(); // dedupe key -> index in `all`
    // Order sources so local rows land first — that way an external duplicate
    // merges INTO the local card (keeping localId) instead of the other way.
    const ordered = [...buckets].sort((a, b) => (a.label === 'mine' ? -1 : b.label === 'mine' ? 1 : 0));
    for (const s of ordered) {
      if (!sources[s.label]) sources[s.label] = { status: s.results.length ? 'ok' : 'empty', count: s.results.length };
      for (const r of s.results) {
        if (f.listing_type && f.listing_type !== 'all' && r.listing_type !== f.listing_type) continue;
        const k = dedupeKey(r);
        const stripped = k.replace(/\|/g, '');
        if (stripped && byKey.has(k)) {
          const existing = all[byKey.get(k)!];
          if (!existing.sources.includes(r.source)) existing.sources.push(r.source);
          // Prefer external URL/photos when the local row lacks them.
          if (!existing.url && r.url) existing.url = r.url;
          if ((!existing.photos || existing.photos.length === 0) && r.photos?.length) existing.photos = r.photos;
          continue;
        }
        byKey.set(k, all.length);
        all.push(r);
      }
    }

    // Token-based text filter, applied ONLY to external rows (local was already
    // filtered server-side via ilike). Every token must appear in at least one
    // text field — this avoids requiring the whole free-text phrase to match.
    const tokens = tokenize(f.q).map((t) => t.toLowerCase());
    return tokens.length === 0
      ? all
      : all.filter((r) => {
          if (r.localId) return true; // already filtered server-side
          const hay = [r.title, r.description, r.city, r.address, r.neighborhood]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return tokens.every((t) => hay.includes(t));
        });
  };

  const collected: Array<{ label: PropertySource; results: UnifiedResult[] }> = [];
  const local = await localTask();
  collected.push(local);
  const localResults = mergeSettled(collected);
  onPartial?.({
    results: localResults,
    sources: { ...sources },
    progress: { done: 1, total: 3, loaded: localResults.length, pending: ['yad2', 'homely'] },
  });

  await Promise.all([
    yad2Task().then((result) => {
      collected.push(result);
      const partial = mergeSettled(collected);
      onPartial?.({ results: partial, sources: { ...sources }, progress: { done: collected.length, total: 3, loaded: partial.length, pending: collected.some((c) => c.label === 'homely') ? [] : ['homely'] } });
    }),
    homelyTask().then((result) => {
      collected.push(result);
      const partial = mergeSettled(collected);
      onPartial?.({ results: partial, sources: { ...sources }, progress: { done: collected.length, total: 3, loaded: partial.length, pending: collected.some((c) => c.label === 'yad2') ? [] : ['yad2'] } });
    }),
  ]);


  const filtered = mergeSettled(collected);
  return {
    results: filtered,
    sources,
    progress: { done: 3, total: 3, loaded: filtered.length, pending: [] },
  };
}

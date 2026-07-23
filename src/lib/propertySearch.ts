// Unified multi-source property search.
// Fans out to local DB + every configured external source (Homely, Yad2, Madlan)
// in parallel and returns a normalized, deduped result set that the UI renders
// as one list with per-row source badges.

import { supabase } from '@/integrations/supabase/client';
import { normalizeImageUrls } from '@/lib/imageHealth';
import type { PropertySource } from '@/components/properties/SourceBadge';

export type UnifiedResult = {
  key: string;                 // stable client-side id
  source: PropertySource;
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
  min_price?: number | null;
  max_price?: number | null;
  rooms?: number | null;
  listing_type?: 'sale' | 'rent' | 'all';
  min_sqm?: number | null;
  property_type?: string | null;
};

export type SourceStatus = 'ok' | 'empty' | 'unavailable' | 'error';
export type SearchResponse = {
  results: UnifiedResult[];
  sources: Record<string, { status: SourceStatus; count: number; error?: string }>;
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

async function searchLocal(f: SearchFilters): Promise<UnifiedResult[]> {
  let q = supabase
    .from('listings')
    .select('id, property_title, description, asking_price, city, address, neighborhood, rooms, sqm, floor, features, source_metadata, source, source_url, media_photos, created_at, updated_at')
    .eq('status', 'live')
    .eq('is_published', true)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (f.q) {
    const like = `%${f.q}%`;
    q = q.or(`property_title.ilike.${like},address.ilike.${like},city.ilike.${like},neighborhood.ilike.${like},description.ilike.${like}`);
  }
  if (f.city && f.city !== 'כל הערים') q = q.eq('city', f.city);
  if (f.min_price != null) q = q.gte('asking_price', f.min_price);
  if (f.max_price != null) q = q.lte('asking_price', f.max_price);
  if (f.rooms != null) q = q.gte('rooms', f.rooms);
  if (f.min_sqm != null) q = q.gte('sqm', f.min_sqm);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row: any): UnifiedResult => {
    const meta = row.source_metadata && typeof row.source_metadata === 'object' ? row.source_metadata : {};
    const sourceRaw = String(row.source ?? '').toLowerCase();
    let source: PropertySource = 'mine';
    if (sourceRaw === 'homely' || sourceRaw === 'webtiv') source = sourceRaw === 'webtiv' ? 'webtiv' : 'homely';
    else if (sourceRaw === 'yad2') source = 'yad2';
    else if (sourceRaw === 'madlan') source = 'madlan';
    const price = normPhone(row.asking_price);
    return {
      key: `local:${row.id}`,
      source,
      localId: row.id,
      title: row.property_title || 'נכס',
      description: row.description ?? null,
      price,
      city: row.city ?? null,
      address: row.address ?? row.neighborhood ?? null,
      neighborhood: row.neighborhood ?? null,
      rooms: row.rooms != null ? Number(row.rooms) : null,
      size_sqm: row.sqm != null ? Number(row.sqm) : null,
      floor: row.floor != null ? Number(row.floor) : null,
      photos: normalizeImageUrls(Array.isArray(row.media_photos) ? row.media_photos.filter((p: any) => typeof p === 'string') : []),
      url: row.source_url ?? meta.source_url ?? null,
      listing_type: inferListingType(price, meta.transaction_type ?? meta.listing_type ?? meta.deal_type),
      property_type: (meta as any).property_type ?? null,
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

export async function searchAllSources(f: SearchFilters): Promise<SearchResponse> {
  const sources: SearchResponse['sources'] = {};
  const body = {
    city: f.city && f.city !== 'כל הערים' ? f.city : undefined,
    min_price: f.min_price ?? undefined,
    max_price: f.max_price ?? undefined,
    rooms: f.rooms ?? undefined,
    limit: 30,
  };

  const tasks: Array<Promise<{ label: PropertySource; results: UnifiedResult[] }>> = [
    searchLocal(f).then((r) => ({ label: 'mine' as const, results: r })).catch((e) => {
      sources.mine = { status: 'error', count: 0, error: String(e?.message ?? e) };
      return { label: 'mine' as const, results: [] };
    }),
    invokeExternal('homely-search', body)
      .then((d: any) => ({ label: 'homely' as const, results: normalizeExternal('homely', d?.results ?? []) }))
      .catch((e) => { sources.homely = { status: 'error', count: 0, error: String(e?.message ?? e) }; return { label: 'homely' as const, results: [] }; }),
    invokeExternal('yad2-search', body)
      .then((d: any) => ({ label: 'yad2' as const, results: normalizeExternal('yad2', d?.results ?? []) }))
      .catch((e) => { sources.yad2 = { status: 'error', count: 0, error: String(e?.message ?? e) }; return { label: 'yad2' as const, results: [] }; }),
    invokeExternal('madlan-search', body)
      .then((d: any) => ({ label: 'madlan' as const, results: normalizeExternal('madlan', d?.results ?? []) }))
      .catch((e) => { sources.madlan = { status: 'error', count: 0, error: String(e?.message ?? e) }; return { label: 'madlan' as const, results: [] }; }),
  ];

  const settled = await Promise.all(tasks);
  const all: UnifiedResult[] = [];
  const seen = new Set<string>();
  for (const s of settled) {
    if (!sources[s.label]) sources[s.label] = { status: s.results.length ? 'ok' : 'empty', count: s.results.length };
    for (const r of s.results) {
      // Apply listing_type filter client-side (external APIs often ignore it)
      if (f.listing_type && f.listing_type !== 'all' && r.listing_type !== f.listing_type) continue;
      const k = dedupeKey(r);
      if (k.replace(/\|/g, '') && seen.has(k)) continue;
      seen.add(k);
      all.push(r);
    }
  }

  // Text filter last so it applies to everything uniformly.
  const q = f.q?.trim().toLowerCase();
  const filtered = q
    ? all.filter((r) => [r.title, r.description, r.city, r.address].filter(Boolean).join(' ').toLowerCase().includes(q))
    : all;

  return { results: filtered, sources };
}

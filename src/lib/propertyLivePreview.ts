// Live, on-the-fly preview enrichment for external property results.
// Fetches the freshest data straight from the source (Homely bulk stream,
// Webtiv, or Yad2 item feed) WITHOUT importing anything into the local
// listings table. Used by PropertyPreviewDialog so the user sees real,
// up-to-date fields (rooms, area, floor, price, photos) in read-only mode.

import { supabase } from '@/integrations/supabase/client';
import { normalizeImageUrls } from '@/lib/imageHealth';
import type { UnifiedResult } from '@/lib/propertySearch';

export type LivePreview = Partial<
  Pick<
    UnifiedResult,
    'title' | 'description' | 'price' | 'city' | 'address' | 'neighborhood' |
    'rooms' | 'size_sqm' | 'floor' | 'photos' | 'url' | 'listing_type' | 'property_type'
  >
> & { fetched_at: string };

function extractHomelyId(result: UnifiedResult): string | null {
  const raw = result.raw ?? {};
  const cand = raw.homely_id ?? raw.external_id ?? raw.serial ?? raw.Sidur ?? raw.sidur ?? raw.id ?? null;
  const s = cand == null ? '' : String(cand).trim();
  return s || null;
}

async function fetchHomelyLive(result: UnifiedResult): Promise<LivePreview | null> {
  const homelyId = extractHomelyId(result);
  if (!homelyId) return null;
  try {
    const { data, error } = await supabase.functions.invoke('homely-fetch-property', {
      body: {
        action: 'searchProperties',
        filters: { search: homelyId, cities: [], rooms: '', type: '', agent: '', deal: 'all' },
        preview_only: true,
      },
    });
    if (error) throw error;
    const items = Array.isArray((data as any)?.properties) ? (data as any).properties : [];
    const match =
      items.find((p: any) => String(p?.homely_id ?? p?.id ?? '') === homelyId) ?? items[0] ?? null;
    if (!match) return null;
    const photos = Array.isArray(match.photos)
      ? match.photos.filter((s: any) => typeof s === 'string')
      : [];
    return {
      title: match.title ?? undefined,
      description: match.description ?? undefined,
      price: Number(match.price) > 0 ? Number(match.price) : null,
      city: match.city ?? undefined,
      address:
        [match.address, match.street, match.number].filter(Boolean).join(' ').trim() ||
        match.address ||
        undefined,
      neighborhood: match.neighborhood ?? undefined,
      rooms: match.rooms != null ? Number(match.rooms) : undefined,
      size_sqm: match.sqm != null ? Number(match.sqm) : undefined,
      floor: match.floor != null ? Number(match.floor) : undefined,
      photos: normalizeImageUrls(photos),
      property_type: match.property_type ?? undefined,
      fetched_at: new Date().toISOString(),
    };
  } catch (e) {
    console.warn('[livePreview] homely live-fetch failed', (e as Error)?.message);
    return null;
  }
}

async function fetchYad2Live(result: UnifiedResult): Promise<LivePreview | null> {
  if (!result.url) return null;
  try {
    const { data, error } = await supabase.functions.invoke('yad2-unlocker', {
      body: { url: result.url, mode: 'item', preview_only: true },
    });
    if (error) throw error;
    const item =
      Array.isArray((data as any)?.results) && (data as any).results[0]
        ? (data as any).results[0]
        : null;
    if (!item) return null;
    return {
      title: item.title ?? undefined,
      description: item.description ?? undefined,
      price: Number(item.price) > 0 ? Number(item.price) : null,
      city: item.city ?? undefined,
      address: item.address ?? undefined,
      neighborhood: item.neighborhood ?? undefined,
      rooms: item.rooms != null ? Number(item.rooms) : undefined,
      size_sqm: item.sqm != null ? Number(item.sqm) : undefined,
      floor: item.floor != null ? Number(item.floor) : undefined,
      photos: normalizeImageUrls(Array.isArray(item.photos) ? item.photos : []),
      fetched_at: new Date().toISOString(),
    };
  } catch (e) {
    console.warn('[livePreview] yad2 live-fetch failed', (e as Error)?.message);
    return null;
  }
}

export async function fetchLivePreview(result: UnifiedResult): Promise<LivePreview | null> {
  if (result.localId) return null; // local rows are already the source of truth
  switch (result.source) {
    case 'homely':
    case 'webtiv':
      return fetchHomelyLive(result);
    case 'yad2':
      return fetchYad2Live(result);
    default:
      return null;
  }
}

export function mergeLive(result: UnifiedResult, live: LivePreview | null): UnifiedResult {
  if (!live) return result;
  return {
    ...result,
    title: live.title || result.title,
    description: live.description ?? result.description,
    price: live.price ?? result.price,
    city: live.city ?? result.city,
    address: live.address ?? result.address,
    neighborhood: live.neighborhood ?? result.neighborhood,
    rooms: live.rooms ?? result.rooms,
    size_sqm: live.size_sqm ?? result.size_sqm,
    floor: live.floor ?? result.floor,
    photos: live.photos && live.photos.length ? live.photos : result.photos,
    property_type: live.property_type ?? result.property_type,
  };
}

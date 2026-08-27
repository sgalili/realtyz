/**
 * Pick images for a scheduled property post.
 *
 * Every scheduled post attaches up to 10 randomly chosen photos of the property,
 * and every slot in a series gets its OWN random mix (distinct main picture +
 * 9 more). Permanently removed photos are never restored — the blocklist is
 * honoured — and the smart vision filter is triggered in the background so
 * logos and photos of people are purged for good.
 */
import { supabase } from '@/integrations/supabase/client';
import { filterBlockedPhotos } from '@/lib/mediaBlocklist';

export const MAX_POST_IMAGES = 10;

const shuffle = <T,>(arr: T[]): T[] => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Fire-and-forget smart filter: removes logos / photos of people permanently. */
const requested = new Set<string>();
export function requestSmartMediaFilter(listingId: string | null | undefined): void {
  if (!listingId || requested.has(listingId)) return;
  requested.add(listingId);
  try {
    void supabase.functions.invoke('filter-listing-media', { body: { listing_id: listingId } });
  } catch { /* decorative background cleanup */ }
}

/** Every allowed (non-blocked) photo of the listing, unshuffled. */
export async function listingImagePool(listingId: string | null | undefined): Promise<string[]> {
  if (!listingId) return [];
  try {
    const { data, error } = await (supabase as any)
      .from('listings')
      .select('media_photos, image_url, source_metadata')
      .eq('id', listingId)
      .maybeSingle();
    if (error || !data) return [];

    const raw: string[] = [];
    const photos = (data as any).media_photos;
    if (Array.isArray(photos)) {
      for (const p of photos) {
        const url = typeof p === 'string' ? p : (p?.url ?? p?.src);
        if (typeof url === 'string' && url.trim()) raw.push(url.trim());
      }
    }
    if (typeof (data as any).image_url === 'string' && (data as any).image_url.trim()) {
      raw.push((data as any).image_url.trim());
    }

    const unique = Array.from(new Set(raw));
    const allowed = filterBlockedPhotos(unique, (data as any).source_metadata);
    // Keep the gallery clean for good — logos/people are stripped in background.
    requestSmartMediaFilter(listingId);
    return allowed;
  } catch {
    return [];
  }
}

/**
 * A fresh random set of up to `limit` images out of the pool — a distinct main
 * picture (first item) plus additional random photos.
 */
export function randomImageSet(pool: string[], limit = MAX_POST_IMAGES): string[] {
  if (pool.length === 0) return [];
  return shuffle(pool).slice(0, Math.max(1, limit));
}

export async function pickListingImages(
  listingId: string | null | undefined,
  limit = MAX_POST_IMAGES,
): Promise<string[]> {
  const pool = await listingImagePool(listingId);
  return randomImageSet(pool, limit);
}

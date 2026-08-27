/**
 * Pick images for a scheduled property post.
 *
 * Every scheduled post attaches up to 10 randomly chosen photos of the property
 * (permanently removed photos are never restored — the blocklist is honoured).
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

export async function pickListingImages(
  listingId: string | null | undefined,
  limit = MAX_POST_IMAGES,
): Promise<string[]> {
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
    return shuffle(allowed).slice(0, Math.max(1, limit));
  } catch {
    return [];
  }
}

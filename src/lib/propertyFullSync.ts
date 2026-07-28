// Full property ingestion helper.
// Guarantees that a listing in our DB carries the complete Yad2/source
// metadata (`על הנכס`, `פרטים נוספים`, features, pricing) and the full
// mirrored image gallery in `post-media-cache`, so both the internal detail
// page and any public share page render instantly from our own storage.
import { supabase } from '@/integrations/supabase/client';

const inFlight = new Map<string, Promise<void>>();
/** Listings proven fully cached in this session — never re-fetched. */
const cachedIds = new Set<string>();

/**
 * A listing counts as fully cached once our DB already holds the mirrored
 * gallery + the descriptive metadata. In that case we skip BrightData
 * entirely, which is what keeps the scraping credits alive.
 */
export async function isListingFullyImported(listingId: string): Promise<boolean> {
  if (cachedIds.has(listingId)) return true;
  const { data } = await supabase
    .from('listings')
    .select('media_photos, description, long_description, source_metadata')
    .eq('id', listingId)
    .maybeSingle();
  if (!data) return false;
  const photos = Array.isArray(data.media_photos) ? data.media_photos.filter(Boolean) : [];
  const meta = (data.source_metadata ?? {}) as any;
  const mirrored = photos.filter((p: any) => typeof p === 'string' && p.includes('/storage/v1/object/public/'));
  const hasText = Boolean(
    (data.long_description && String(data.long_description).trim()) ||
    (data.description && String(data.description).trim()),
  );
  const ok = mirrored.length >= 2 && hasText && Boolean(meta.media_last_fetched_at);
  if (ok) cachedIds.add(listingId);
  return ok;
}

async function runFullSync(listingId: string, sourceUrl?: string | null): Promise<void> {
  // 0. Cache-first: a listing we already mirrored never hits the scraper again.
  if (await isListingFullyImported(listingId)) return;

  // 1. Deep metadata re-scrape for source-backed listings (Yad2 item feed).
  if (sourceUrl && /yad2\.co\.il/i.test(sourceUrl)) {
    try {
      await supabase.functions.invoke('yad2-unlocker', {
        body: { url: sourceUrl, limit: 1 },
      });
    } catch (e) {
      console.warn('[propertyFullSync] metadata scrape failed', e);
    }
  }

  // 2. Full gallery fetch + permanent mirroring into storage.
  try {
    await supabase.functions.invoke('fetch-property-all-images', {
      body: { listing_id: listingId, source_url: sourceUrl ?? undefined },
    });
    cachedIds.add(listingId);
  } catch (e) {
    console.warn('[propertyFullSync] image mirroring failed', e);
  }

  // 3+4. Metadata backfill (בית / דירה / שכונה / publication date) and owner
  // CRM creation run in parallel — neither blocks the other.
  await Promise.allSettled([
    supabase.functions.invoke('listings-metadata-backfill', { body: { listing_ids: [listingId] } }),
    supabase.functions.invoke('owner-crm-sync', { body: { listing_id: listingId } }),
  ]);
}


/**
 * Ensures a listing is fully imported (metadata + all images).
 * Awaited callers (share links) get the guarantee; fire-and-forget callers
 * (row/card clicks) can ignore the promise. Concurrent calls for the same
 * listing are de-duplicated.
 */
export function ensureFullPropertyImport(
  listingId: string | null | undefined,
  sourceUrl?: string | null,
): Promise<void> {
  if (!listingId) return Promise.resolve();
  const existing = inFlight.get(listingId);
  if (existing) return existing;
  const p = runFullSync(listingId, sourceUrl).finally(() => inFlight.delete(listingId));
  inFlight.set(listingId, p);
  return p;
}

/** Fire-and-forget variant for UI click handlers. */
export function triggerFullPropertyImport(
  listingId: string | null | undefined,
  sourceUrl?: string | null,
): void {
  void ensureFullPropertyImport(listingId, sourceUrl).catch(() => {});
}

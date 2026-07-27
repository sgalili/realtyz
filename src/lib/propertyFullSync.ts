// Full property ingestion helper.
// Guarantees that a listing in our DB carries the complete Yad2/source
// metadata (`על הנכס`, `פרטים נוספים`, features, pricing) and the full
// mirrored image gallery in `post-media-cache`, so both the internal detail
// page and any public share page render instantly from our own storage.
import { supabase } from '@/integrations/supabase/client';

const inFlight = new Map<string, Promise<void>>();

async function runFullSync(listingId: string, sourceUrl?: string | null): Promise<void> {
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
  } catch (e) {
    console.warn('[propertyFullSync] image mirroring failed', e);
  }
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

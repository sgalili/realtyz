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

/** Listings whose textual/structural metadata is proven complete this session. */
const metaCachedIds = new Set<string>();

/**
 * Metadata-only completeness check (images intentionally ignored).
 * A row only counts as hydrated when it carries a REAL description (not the
 * auto-generated "city · neighborhood" placeholder), the parsed structural
 * fields, a publication date AND the actual property attribute bag
 * (`additional_details` / `attributes` / `features`). Without the last check
 * half-scraped rows were treated as done, which is why detail pages showed
 * only "מ״ר" + "חדרים" and never re-hydrated.
 */
export async function isListingMetadataImported(listingId: string): Promise<boolean> {
  if (metaCachedIds.has(listingId) || cachedIds.has(listingId)) return true;
  const { data } = await supabase
    .from('listings')
    .select('property_title, description, long_description, neighborhood, house_number, apartment_number, rooms, sqm, asking_price, source_metadata, additional_details, attributes, features')
    .eq('id', listingId)
    .maybeSingle();
  if (!data) return false;
  const meta = (data.source_metadata ?? {}) as any;
  const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const title = norm((data as any).property_title);
  const long = norm(data.long_description);
  const short = norm(data.description);
  // A description identical to the generated headline is not real content.
  const realText = [long, short].find((t) => t.length >= 25 && t !== title) || '';
  const hasText = Boolean(realText);
  const hasStructure = Boolean(data.neighborhood || data.house_number || data.apartment_number);
  const hasDate = Boolean(meta.published_at || meta.original_published_at || meta.date_added);
  const bagSize = [
    (data as any).additional_details,
    (data as any).attributes,
    (data as any).features,
  ].reduce((n, bag) => {
    if (!bag || typeof bag !== 'object') return n;
    return n + (Array.isArray(bag) ? bag.length : Object.keys(bag).length);
  }, 0);
  const hasAttributes = bagSize >= 5;
  const ok = hasText && hasStructure && hasDate && hasAttributes;

  if (ok) metaCachedIds.add(listingId);
  return ok;
}

/**
 * Metadata-only hydration: re-parses the source ad for text/structure and runs
 * the backfill + owner CRM sync. Deliberately does NOT touch the image
 * pipeline — galleries are pulled lazily, only when the user asks for them.
 * `onProgress` reports REAL step completion (0-100) so the UI ring is
 * determinate instead of animated guesswork.
 */
type ProgressFn = (percent: number) => void;

/** Bounded invoke: never let one slow scrape hold the loader hostage. */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | null> {
  return await Promise.race([
    p.catch((e) => { console.warn(`[propertyFullSync] ${label} failed`, e); return null as T | null; }),
    new Promise<null>((r) => setTimeout(() => r(null), ms)),
  ]);
}

async function runMetadataSync(
  listingId: string,
  sourceUrl?: string | null,
  onProgress?: ProgressFn,
): Promise<void> {
  let reported = 0;
  const step = (p: number) => {
    if (p <= reported) return;
    reported = p;
    try { onProgress?.(p); } catch { /* ignore */ }
  };
  step(8);
  if (await isListingMetadataImported(listingId)) { step(100); return; }
  step(18);

  if (sourceUrl && /yad2\.co\.il/i.test(sourceUrl)) {
    // Fine-grained time-based progress while the (single) source parse runs, so
    // the ring keeps moving instead of freezing at the milestone value.
    const started = Date.now();
    const creep = setInterval(() => {
      const elapsed = Date.now() - started;
      step(18 + Math.min(50, Math.round((elapsed / 12000) * 50)));
    }, 150);
    await withTimeout(
      Promise.resolve(supabase.functions.invoke('yad2-unlocker', { body: { url: sourceUrl, limit: 1 } })),
      6000,
      'metadata scrape',
    );
    clearInterval(creep);
  }
  step(70);

  // Owner provisioning is managed independently by the detail page. Keeping
  // it out of this critical path avoids two duplicate 30s calls per visit.
  await withTimeout(
    Promise.resolve(supabase.functions.invoke('listings-metadata-backfill', { body: { listing_ids: [listingId] } })),
    6000,
    'metadata backfill',
  );
  step(95);
  // Only cache a proven-complete row. A timed-out scraper keeps running on the
  // server, so marking the id complete here used to leave the current tab with
  // its original thin snapshot forever.
  if (await isListingMetadataImported(listingId)) metaCachedIds.add(listingId);
  step(100);
}


const metaInFlight = new Map<string, Promise<void>>();

/** De-duplicated metadata-only hydration for the detail page. */
export function ensureMetadataImport(
  listingId: string | null | undefined,
  sourceUrl?: string | null,
  onProgress?: ProgressFn,
): Promise<void> {
  if (!listingId) return Promise.resolve();
  const existing = metaInFlight.get(listingId);
  if (existing) return existing;
  const p = runMetadataSync(listingId, sourceUrl, onProgress).finally(() => metaInFlight.delete(listingId));
  metaInFlight.set(listingId, p);
  return p;
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

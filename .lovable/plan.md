## Problem

Rachel's property (and any single Homely listing) never shows its photos/docs because the single-listing branch of `homely-fetch-property` is broken in three ways:

1. It only reads the **summary row** from `getInterestingAdminByAgent` (which carries at most a single thumbnail) and never calls Homely's per-property detail endpoint, so `pic1…picN` and file fields are never seen.
2. Even the one thumbnail it does find is written into `source_metadata.photos` — but the UI (`src/pages/PropertyDetail.tsx`) reads from the top-level `listings.media_photos` / `media_documents` columns. So the image is fetched and then dropped on the floor.
3. Nothing is persisted off Homely's CDN — every visit re-hits their API, which is exactly the spam/ban risk you called out. The existing `collectMedia()` helper is only used by the bulk sync path.

## Fix

### 1. `supabase/functions/homely-fetch-property/index.ts` — single-listing branch (lines ~706‑782)

- After locating the matching `detail` in the broker's active list, call the property‑detail endpoints Homely's web app uses (same pattern the bulk sync already uses) to get the full record with `pic1…picN`, `file1…`, `doc1…` fields. Endpoints to try in order, first non-empty wins:
  - `/api/report/getNechesFullDetail/{hash}/{serial}`
  - `/api/report/getNechesData/{hash}/{serial}`
  - `/api/hashData/getAllKeys/{hash}` (POST) with `{ id: serial }`
  - Fallback: the summary `detail` itself.
- Run `collectMedia(fullDetail)` → `{ photos[], documents[] }`.
- **Persist each URL to Supabase Storage once** (new public bucket `homely-media`, path `listing/{listing_id}/{sha1(url)}.{ext}`). Skip download if the storage object already exists. Replace the array entries with the public storage URL. This guarantees instant loads and zero re-hits to Homely.
- Write the resolved arrays into the top-level columns the UI reads:
  ```
  media_photos: <storage urls>
  media_documents: <storage urls>
  source_metadata: { ...meta, homely_raw: fullDetail, photos_origin: <originals>, synced_at }
  ```
- Guard the whole persist step behind a 10‑second timeout per file and a hard cap (e.g. 40 photos, 20 docs) so a bad listing can't stall the function.

### 2. New migration: create the `homely-media` storage bucket

- Public bucket, RLS: public SELECT, INSERT/UPDATE/DELETE restricted to `service_role` (only the edge function writes to it).

### 3. `src/pages/PropertyDetail.tsx` — client hydration

- Extend the existing `sessionStorage` sentinel (`homely-hydrate:{id}`) so it clears itself if the invoke fails, allowing a retry on the next visit but never spamming inside a session.
- No longer relevant to re-fetch once `media_photos.length > 0` — that guard is already in place; keep it.
- Also read `media_documents` into the docs panel (already partly wired via `data.documents`, confirm the merge includes the new column).

### 4. Manual re-hydration path

- Add a small `force: true` flag on the edge function so the "Refresh from Homely" button in `PropertyDetailView` can bypass the cache. Everything else still uses the cache-first flow.

## Result

- First visit to Rachel's property: one call to Homely → all photos + docs downloaded once → copies land in Storage → arrays saved to `listings.media_photos` / `media_documents`.
- Every subsequent visit for any user: images render instantly from our Storage CDN, zero Homely traffic, zero ban risk.
- Bulk sync path is untouched (already correct).

## Files touched

- `supabase/functions/homely-fetch-property/index.ts` (single-listing branch + new `mirrorToStorage()` helper)
- `supabase/migrations/<ts>_homely_media_bucket.sql` (bucket + storage policies)
- `src/pages/PropertyDetail.tsx` (sentinel cleanup on failure, docs read)
- `src/components/properties/PropertyDetailView.tsx` (wire `force:true` refresh button — small)

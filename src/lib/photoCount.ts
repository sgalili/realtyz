/**
 * Resolves the TOTAL number of images a listing has on its source page,
 * even when the media has not been mirrored into our storage yet.
 * Falls back to the count of already-imported photos.
 */
export function sourcePhotoCount(row: any, importedCount = 0): number {
  if (!row) return importedCount;
  const raw = (row.raw ?? row) as any;
  const meta = (raw?.source_metadata && typeof raw.source_metadata === 'object' ? raw.source_metadata : {}) as any;

  const numeric = [
    raw?.images_count, raw?.photos_count, raw?.media_count, raw?.image_count,
    meta?.images_count, meta?.photos_count, meta?.media_count, meta?.total_images,
  ]
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  const arrays = [
    raw?.photos, raw?.images, raw?.media_photos,
    meta?.photos, meta?.images,
  ]
    .filter(Array.isArray)
    .map((a: unknown[]) => a.length);

  return Math.max(importedCount, 0, ...numeric, ...arrays);
}

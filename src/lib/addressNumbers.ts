// Internal-only helpers: extract the house number and apartment number from a
// listing. These values are shown ONLY inside the workspace table / search
// results. Public pages and outbound shares must keep using
// `stripAddressNumbers` (Owner Law #1) and never render these.

function firstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

/** House (building) number, e.g. "27" from "בן יהודה 27, דירה 19". */
export function houseNumberOf(input: { address?: string | null; raw?: any }): string {
  const r = input.raw ?? {};
  const meta = r.source_metadata && typeof r.source_metadata === 'object' ? r.source_metadata : {};
  const explicit = firstNonEmpty(
    r.house_number, r.houseNumber, r.street_number, r.streetNumber, r.number,
    meta.house_number, meta.houseNumber, meta.street_number, meta.streetNumber, meta.number,
  );
  if (explicit) return explicit;
  const addr = String(input.address ?? '').replace(/\s+/g, ' ').trim();
  if (!addr) return '';
  // First numeric group that is not preceded by an apartment marker.
  const head = addr.split(/(?:,|\s)+(?:דירה|דירת|יח["׳']?|apt\.?|apartment|unit|#)/i)[0];
  const m = head.match(/(\d{1,4}[א-תA-Za-z]?)(?!.*\d)/) || head.match(/(\d{1,4}[א-תA-Za-z]?)/);
  return m ? m[1] : '';
}

/** Apartment / unit number, e.g. "19". */
export function apartmentNumberOf(input: { address?: string | null; raw?: any }): string {
  const r = input.raw ?? {};
  const meta = r.source_metadata && typeof r.source_metadata === 'object' ? r.source_metadata : {};
  const explicit = firstNonEmpty(
    r.apartment_number, r.apartmentNumber, r.apt_number, r.aptNumber,
    r.apartment, r.apt, r.unit, r.unit_number,
    meta.apartment_number, meta.apartmentNumber, meta.apt_number, meta.aptNumber,
    meta.apartment, meta.apt, meta.unit, meta.unit_number,
  );
  if (explicit) return explicit;
  const addr = String(input.address ?? '').replace(/\s+/g, ' ').trim();
  if (!addr) return '';
  const marked = addr.match(/(?:דירה|דירת|ד['׳"]|יח["׳']|apt\.?|apartment|unit|#)\s*(\d{1,4}[א-תA-Za-z]?)/i);
  if (marked) return marked[1];
  // Bare second numeric group: "הפסנתר 8 16" → apartment 16.
  const tail = addr.match(/\d{1,4}[א-תA-Za-z]?\s+(\d{1,4}[א-תA-Za-z]?)\s*$/);
  return tail ? tail[1] : '';
}

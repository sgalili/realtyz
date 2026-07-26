import { supabase } from '@/integrations/supabase/client';

export type Comparable = {
  id: string;
  address: string | null;
  city: string | null;
  neighborhood: string | null;
  price: number;
  sqm: number | null;
  rooms: number | null;
  features: string[];
  photo: string | null;
  soldAt: string;
};

export type AreaMarketFacts = {
  city: string;
  neighborhood: string | null;
  dealType: 'sale' | 'rent';
  /** Number of comparable listings recorded in the area over the last 5 years. */
  sampleSize: number;
  avgPrice: number | null;
  medianPrice: number | null;
  avgPricePerSqm: number | null;
  avgRooms: number | null;
  avgSqm: number | null;
  /** Rough YoY direction based on the two most recent full years of data. */
  trendPct: number | null;
  /** Ready-to-use Hebrew sentences for landing pages and generated posts. */
  highlights: string[];
  /** Real historical comparables (address, sqm, features, price, photo). */
  comparables: Comparable[];
};

const FIVE_YEARS_MS = 5 * 365 * 24 * 60 * 60 * 1000;


function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}
function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}
function fmt(n: number): string {
  return `₪${n.toLocaleString('he-IL')}`;
}

/**
 * Real local market facts for an area, computed from the listings we already
 * cache locally (last 5 years), strictly matched to the transaction type so a
 * rental page never quotes sale prices and vice versa.
 */
export async function getAreaMarketFacts(
  city: string | null | undefined,
  dealType: 'sale' | 'rent',
  neighborhood?: string | null,
): Promise<AreaMarketFacts | null> {
  if (!city) return null;
  const since = new Date(Date.now() - FIVE_YEARS_MS).toISOString();

  const { data, error } = await supabase
    .from('listings')
    .select('id, property_title, address, asking_price, sqm, rooms, deal_type, neighborhood, features, media_photos, created_at')
    .eq('city', city)
    .gte('created_at', since)
    .limit(1000);

  if (error) {
    console.error('[areaMarketFacts] query failed', error);
    return null;
  }

  const isRent = (row: any) =>
    row.deal_type ? String(row.deal_type) === 'rent' : Number(row.asking_price) < 50_000;

  let rows = (data ?? []).filter(
    (r: any) => Number(r.asking_price) > 0 && (dealType === 'rent' ? isRent(r) : !isRent(r)),
  );
  // Prefer same-neighborhood comparables when we have a meaningful sample.
  if (neighborhood) {
    const local = rows.filter((r: any) => r.neighborhood === neighborhood);
    if (local.length >= 4) rows = local;
  }
  if (!rows.length) return null;

  const prices = rows.map((r: any) => Number(r.asking_price));
  const perSqm = rows
    .filter((r: any) => Number(r.sqm) > 0)
    .map((r: any) => Number(r.asking_price) / Number(r.sqm));
  const roomsArr = rows.filter((r: any) => Number(r.rooms) > 0).map((r: any) => Number(r.rooms));
  const sqmArr = rows.filter((r: any) => Number(r.sqm) > 0).map((r: any) => Number(r.sqm));

  // Year-over-year direction from the two most recent years present.
  const byYear = new Map<number, number[]>();
  for (const r of rows as any[]) {
    const y = new Date(r.created_at).getFullYear();
    byYear.set(y, [...(byYear.get(y) ?? []), Number(r.asking_price)]);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);
  let trendPct: number | null = null;
  if (years.length >= 2) {
    const cur = avg(byYear.get(years[0])!);
    const prev = avg(byYear.get(years[1])!);
    if (cur && prev) trendPct = Math.round(((cur - prev) / prev) * 1000) / 10;
  }

  const avgPrice = avg(prices);
  const avgSqmPrice = avg(perSqm);
  const avgRooms = roomsArr.length
    ? Math.round((roomsArr.reduce((a, b) => a + b, 0) / roomsArr.length) * 10) / 10
    : null;

  const label = dealType === 'rent' ? 'להשכרה' : 'למכירה';
  const highlights: string[] = [];
  highlights.push(
    `${rows.length} עסקאות ${label} נרשמו ב${neighborhood || city} בחמש השנים האחרונות`,
  );
  if (avgPrice) {
    highlights.push(
      dealType === 'rent'
        ? `שכר דירה ממוצע באזור: ${fmt(avgPrice)} לחודש`
        : `מחיר ממוצע באזור: ${fmt(avgPrice)}`,
    );
  }
  if (avgSqmPrice && dealType === 'sale') highlights.push(`ממוצע של ${fmt(avgSqmPrice)} למ"ר`);
  if (trendPct != null && Math.abs(trendPct) >= 1) {
    highlights.push(
      trendPct > 0
        ? `מגמת מחירים עולה של כ-${trendPct}% בשנה האחרונה`
        : `מגמת מחירים יורדת של כ-${Math.abs(trendPct)}% בשנה האחרונה, הזדמנות לקונים`,
    );
  }

  const featureList = (f: any): string[] => {
    if (Array.isArray(f)) return f.map((x) => String(x)).filter(Boolean).slice(0, 4);
    if (f && typeof f === 'object') {
      return Object.entries(f)
        .filter(([, v]) => v === true || (typeof v === 'string' && v.trim()))
        .map(([k, v]) => (v === true ? k : `${k}: ${v}`))
        .slice(0, 4);
    }
    return [];
  };

  const comparables: Comparable[] = (rows as any[])
    .slice()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 6)
    .map((r) => ({
      id: String(r.id),
      address: r.address ?? r.property_title ?? null,
      city,
      neighborhood: r.neighborhood ?? null,
      price: Number(r.asking_price),
      sqm: Number(r.sqm) > 0 ? Number(r.sqm) : null,
      rooms: Number(r.rooms) > 0 ? Number(r.rooms) : null,
      features: featureList(r.features),
      photo: Array.isArray(r.media_photos) && typeof r.media_photos[0] === 'string' ? r.media_photos[0] : null,
      soldAt: r.created_at,
    }));

  return {
    city,
    neighborhood: neighborhood ?? null,
    dealType,
    sampleSize: rows.length,
    avgPrice,
    medianPrice: median(prices),
    avgPricePerSqm: avgSqmPrice,
    avgRooms,
    avgSqm: avg(sqmArr),
    trendPct,
    highlights,
    comparables,
  };
}

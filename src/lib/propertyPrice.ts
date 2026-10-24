import { fmtILS } from '@/lib/formatCurrency';

/** True when a listing/deal type represents a monthly rental. */
export const isRentDeal = (dealType?: string | null): boolean => dealType === 'rent';

/** Hebrew monthly-rent suffix: " / לחודש" for rentals, empty string otherwise. */
export const rentSuffix = (dealType?: string | null): string => (isRentDeal(dealType) ? ' / לחודש' : '');

/** Formats a property price as ₪X, appending the monthly-rent suffix for rentals. Empty string when the price is missing. */
export function formatRentalPrice(price: number | string | null | undefined, dealType?: string | null): string {
  const n = typeof price === 'string' ? Number(String(price).replace(/[^\d.]/g, '')) : price;
  if (!n || !Number.isFinite(n) || n <= 0) return '';
  return `${fmtILS(n)}${rentSuffix(dealType)}`;
}

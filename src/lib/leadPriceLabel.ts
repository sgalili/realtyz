import { fmtILS } from '@/lib/formatCurrency';

/** Collapsed lead card shows its per-lead price, or "0₪" when none is set. */
export function leadPriceLabel(value: string | number | null | undefined): string {
  const price = Number(String(value ?? '').replace(/[^\d.]/g, '')) || 0;
  return price > 0 ? fmtILS(price) : '0₪';
}

import { fmtILS } from '@/lib/formatCurrency';

/**
 * Commission display: shekels always lead, the percentage follows immediately in parentheses.
 * Applied to sale and rent closing/fee sliders and their bounds.
 */

/** "(50%)" — the percentage half of a commission label. */
export function commissionPercentLabel(percent: number): string {
  const value = Number(percent);
  return `(${Number((Number.isFinite(value) ? value : 0).toFixed(2))}%)`;
}

/** Shekel amount of a percent-based commission on a base price (asking price or one month's rent). */
export function commissionAmountFromPercent(price: number, percent: number): number {
  const base = Math.max(0, Number(price) || 0);
  const value = Number(percent);
  return Math.round(base * (Number.isFinite(value) ? value : 0) / 100);
}

/** "₪2,667 (50%)" — shekels first, percentage immediately after in parentheses. */
export function commissionOfferLabel(amount: number, percent: number): string {
  return `${fmtILS(Math.round(Math.max(0, Number(amount) || 0)))} ${commissionPercentLabel(percent)}`;
}

/** "₪2,667 (50%)" from a base price and a percentage, or the bare percentage when no price is known. */
export function commissionOfferFromPrice(price: number, percent: number): string {
  const base = Math.max(0, Number(price) || 0);
  return base > 0 ? commissionOfferLabel(commissionAmountFromPercent(base, percent), percent) : commissionBarePercent(percent);
}

/** "50%" — the only display allowed when no base price exists to convert from. */
export function commissionBarePercent(percent: number): string {
  const value = Number(percent);
  return `${Number((Number.isFinite(value) ? value : 0).toFixed(2))}%`;
}

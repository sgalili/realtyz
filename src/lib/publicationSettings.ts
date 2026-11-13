import { LEAD_PRICE_RANGES } from './leadPriceRanges';
import { closingFeeRange } from './closingFee';
import { allLeadPricesZero } from './leadPricesZero';

export const TERMINAL_LISTING_STATUSES = ['discarded', 'sold', 'removed', 'deleted', 'closed', 'archived', 'off_market', 'נמכר', 'הוסר'] as const;
export const isTerminalListing = (status: unknown) => TERMINAL_LISTING_STATUSES.includes(String(status ?? '').toLowerCase() as typeof TERMINAL_LISTING_STATUSES[number]);
export const brokerOnlyPricing = (values: unknown[]) => values.length === 3 && allLeadPricesZero({ commissionForm: values[0], commissionWhatsapp: values[1], commissionPhone: values[2] });
export function validPublicationFees(deal: string | null | undefined, price: number, values: number[], closing: number, unit: string) {
  const range = closingFeeRange(deal, price);
  const percent = unit === 'percent' ? closing : price > 0 ? closing / price * 100 : NaN;
  return price > 0 && Number.isFinite(percent) && percent >= range.min - 0.000001 && percent <= range.max + 0.000001
    && values.length === 3 && values.every((value, index) => {
      const bounds = Object.values(LEAD_PRICE_RANGES)[index];
      return bounds && Number.isFinite(value) && (value === 0 || (value >= bounds.min && value <= bounds.max));
    });
}
export function parseDailyLimit(value: string, max?: number): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || (max !== undefined && n > max)) throw new Error('המגבלה חייבת להיות מספר שלם חיובי' + (max ? ` עד ${max}` : ''));
  return n;
}
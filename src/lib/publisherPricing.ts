import { closingFeeRange } from './closingFee';

/** Count price digits, not formatting separators. */
export function showPublisherRewards(price: string): boolean {
  return price.replace(/\D/g, '').length > 4;
}

/** Sale starts at 1%; rentals retain their existing legal minimum. */
export function publisherClosingDefault(dealType: string): number {
  return dealType === 'rent' ? closingFeeRange(dealType, 0).min : 1;
}
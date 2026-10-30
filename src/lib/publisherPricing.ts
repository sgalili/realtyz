/** Count price digits, not formatting separators. */
export function showPublisherRewards(price: string): boolean {
  return price.replace(/\D/g, '').length > 4;
}

/** Defaults apply only to commission values that the publisher has not defined. */
export function publisherClosingDefault(dealType: string): number {
  return dealType === 'rent' ? 50 : 1;
}

export function publisherClosingPercent(value: number, valueType: 'fixed' | 'percent' | undefined, price: number): number {
  return valueType === 'fixed' ? (price > 0 ? value / price * 100 : 0) : value;
}
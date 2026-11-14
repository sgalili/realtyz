export function leadAuthorizationAmount(bids: number[], dailyMaximum: number | null) {
  if (bids.some(n => !Number.isFinite(n) || n < 0) || (dailyMaximum !== null && (!Number.isFinite(dailyMaximum) || dailyMaximum <= 0))) throw new Error('invalid_amount');
  return dailyMaximum ?? Math.max(0, ...bids) * 5;
}
export function canSaveGrowCard(order: { status: string; environment: string; payment_method: string | null; card_mandate: boolean }) {
  return order.status === 'paid' && order.environment === 'live' && order.payment_method === 'card' && order.card_mandate;
}
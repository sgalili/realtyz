export const GROW_SUBSCRIPTION_AMOUNT_ILS = 6500;
export const GROW_PAYMENT_METHODS = ['card', 'bit', 'apple_pay', 'google_pay', 'bank_transfer'] as const;
export type GrowPaymentMethod = typeof GROW_PAYMENT_METHODS[number];
export const GROW_CUSTOMER_FIELDS = ['full_name', 'phone', 'email', 'national_id'] as const;
export type GrowCustomerField = typeof GROW_CUSTOMER_FIELDS[number];
export function paymentSmsEligible(order: { status: string; environment: string; customer_phone?: string | null }) {
  return order.status === 'paid' && order.environment === 'live' && /^05\d{8}$/.test(order.customer_phone ?? '');
}
export function paymentSmsSummary(order: { title: string; amount_ils: number; id: string }) {
  const title = order.title.replace(/[\r\n\t]/g, ' ').slice(0, 70);
  return `TORAFF: התשלום עבור ${title} התקבל. סכום: ₪${order.amount_ils.toLocaleString('he-IL')}. אסמכתה: ${order.id.slice(0, 8)}.`;
}
export function growConfigurationReady(s: { enabled?: boolean; subscription_title?: string; duration_days?: number | null; benefits?: string }) {
  return s.enabled === true && Boolean(s.subscription_title?.trim()) && Number.isInteger(s.duration_days) && Number(s.duration_days) >= 1 && Number(s.duration_days) <= 3650 && Boolean(s.benefits?.trim());
}
export function isMakeWebhookUrl(value: string) {
  try { const u = new URL(value); return u.protocol === 'https:' && /^hook\.(?:[a-z0-9-]+\.)?(?:make\.com|integromat\.com)$/.test(u.hostname) && !u.username && !u.password; } catch { return false; }
}
export function validGrowPaymentUrl(value: string) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && /(^|\.)(grow\.business|meshulam\.co\.il)$/.test(u.hostname); } catch { return false; }
}
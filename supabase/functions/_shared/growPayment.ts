export const GROW_SUBSCRIPTION_AMOUNT_ILS = 6500;
export function growConfigurationReady(s: { enabled?: boolean; subscription_title?: string; duration_days?: number | null; benefits?: string }) {
  return s.enabled === true && Boolean(s.subscription_title?.trim()) && Number.isInteger(s.duration_days) && Number(s.duration_days) >= 1 && Number(s.duration_days) <= 3650 && Boolean(s.benefits?.trim());
}
export function isMakeWebhookUrl(value: string) {
  try { const u = new URL(value); return u.protocol === 'https:' && /^hook\.(?:[a-z0-9-]+\.)?(?:make\.com|integromat\.com)$/.test(u.hostname) && !u.username && !u.password; } catch { return false; }
}
export function validGrowPaymentUrl(value: string) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && /(^|\.)(grow\.business|meshulam\.co\.il)$/.test(u.hostname); } catch { return false; }
}
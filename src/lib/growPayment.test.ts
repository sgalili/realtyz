import { describe, expect, it } from 'vitest';
import { GROW_PAYMENT_METHODS, GROW_SUBSCRIPTION_AMOUNT_ILS, growConfigurationReady, isMakeWebhookUrl, paymentSmsEligible, paymentSmsSummary, validGrowPaymentUrl } from '../../supabase/functions/_shared/growPayment';
describe('Grow payment safeguards', () => {
  it('supports all five requested methods without accepting arbitrary gateway methods', () => {
    expect([...GROW_PAYMENT_METHODS]).toEqual(['card', 'bit', 'apple_pay', 'google_pay', 'bank_transfer']);
  });
  it('sends transaction summaries only for completed live payments with a valid customer mobile', () => {
    expect(paymentSmsEligible({ status: 'paid', environment: 'live', customer_phone: '0501234567' })).toBe(true);
    expect(paymentSmsEligible({ status: 'link_ready', environment: 'live', customer_phone: '0501234567' })).toBe(false);
    expect(paymentSmsEligible({ status: 'paid', environment: 'sandbox', customer_phone: '0501234567' })).toBe(false);
    expect(paymentSmsEligible({ status: 'paid', environment: 'live', customer_phone: null })).toBe(false);
  });
  it('summarizes the actual paid action and amount without private payment details', () => {
    const summary = paymentSmsSummary({ title: 'מנוי מקצועי', amount_ils: 6500, id: '12345678-aaaa-bbbb-cccc-123456789012' });
    expect(summary).toContain('מנוי מקצועי');
    expect(summary).toContain('6,500');
    expect(summary).toContain('12345678');
    expect(summary).not.toContain('12345678-aaaa');
  });
  it('charges the requested subscription amount, not wallet credits', () => expect(GROW_SUBSCRIPTION_AMOUNT_ILS).toBe(6500));
  it('cannot activate unspecified subscription terms', () => {
    expect(growConfigurationReady({ enabled: true, subscription_title: 'מנוי', benefits: 'גישה', duration_days: null })).toBe(false);
    expect(growConfigurationReady({ enabled: true, subscription_title: 'מנוי', benefits: 'גישה', duration_days: 30 })).toBe(true);
    expect(growConfigurationReady({ enabled: false, subscription_title: 'מנוי', benefits: 'גישה', duration_days: 30 })).toBe(false);
  });
  it('restricts secret-bearing calls to Make webhooks', () => {
    expect(isMakeWebhookUrl('https://hook.eu1.make.com/example')).toBe(true);
    expect(isMakeWebhookUrl('https://hook.make.com.attacker.test/example')).toBe(false);
    expect(isMakeWebhookUrl('http://hook.eu1.make.com/example')).toBe(false);
  });
  it('rejects unrelated checkout links', () => {
    expect(validGrowPaymentUrl('https://pay.grow.business/payment')).toBe(true);
    expect(validGrowPaymentUrl('https://grow.business.attacker.test/payment')).toBe(false);
  });
});
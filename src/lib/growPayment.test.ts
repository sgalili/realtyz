import { describe, expect, it } from 'vitest';
import { GROW_SUBSCRIPTION_AMOUNT_ILS, growConfigurationReady, isMakeWebhookUrl, validGrowPaymentUrl } from '../../supabase/functions/_shared/growPayment';
describe('Grow payment safeguards', () => {
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
import { describe, it, expect } from 'vitest';
import { canSaveGrowCard, leadAuthorizationAmount } from '../../supabase/functions/_shared/growLeadBilling';
describe('Grow lead billing rules', () => {
  it('checks five times the highest submitted bid: 300 ILS means 1500 ILS', () => expect(leadAuthorizationAmount([100, 300, 200], null)).toBe(1500));
  it('uses the explicitly defined daily maximum instead of the multiplier', () => expect(leadAuthorizationAmount([100, 300, 200], 800)).toBe(800));
  it('never saves a card from sandbox, non-card, unpaid or nonconsenting payments', () => {
    const order = { status: 'paid', environment: 'live', payment_method: 'card', card_mandate: true };
    expect(canSaveGrowCard(order)).toBe(true);
    expect(canSaveGrowCard({ ...order, card_mandate: false })).toBe(false);
    expect(canSaveGrowCard({ ...order, environment: 'sandbox' })).toBe(false);
    expect(canSaveGrowCard({ ...order, payment_method: 'bit' })).toBe(false);
    expect(canSaveGrowCard({ ...order, status: 'link_ready' })).toBe(false);
  });
});
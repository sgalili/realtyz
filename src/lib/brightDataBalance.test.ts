import { describe, it, expect } from 'vitest';
import { brightDataBalanceExhausted } from '../../supabase/functions/_shared/brightDataBalance';
describe('Bright Data balance evidence', () => {
  it('detects explicit exhausted provider credits', () => { expect(brightDataBalanceExhausted(403, 'Bright Data: insufficient credits')).toBe(true); });
  it('detects a provider payment-required reply', () => { expect(brightDataBalanceExhausted(402, 'Bright Data payment required')).toBe(true); });
  it('does not guess balance from suspension, auth or request throttling', () => {
    expect(brightDataBalanceExhausted(407, 'Bright Data account suspended client_10020')).toBe(false);
    expect(brightDataBalanceExhausted(429, 'Bright Data rate limit exceeded')).toBe(false);
    expect(brightDataBalanceExhausted(401, 'Bright Data invalid API key')).toBe(false);
    expect(brightDataBalanceExhausted(402, 'Internal account payment required')).toBe(false);
  });
});
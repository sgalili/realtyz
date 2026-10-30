import { describe, expect, it } from 'vitest';
import { publisherMarketingDecision } from './publisherMarketing';

describe('voluntary publisher marketing consent', () => {
  it('asks for a decision when consent is unchecked', () => {
    expect(publisherMarketingDecision(false, false)).toBe('explain');
  });
  it('allows continuing after decline without granting consent', () => {
    expect(publisherMarketingDecision(false, true)).toBe('continue');
  });
  it('does not interrupt explicit consent', () => {
    expect(publisherMarketingDecision(true, false)).toBe('continue');
  });
});
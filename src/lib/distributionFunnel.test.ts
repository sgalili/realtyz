import { describe, expect, it } from 'vitest';
import { funnelErrorMessage } from './distributionFunnel';
describe('funnelErrorMessage', () => {
  it('asks guests to sign in', () => expect(funnelErrorMessage('not_authorized')).toContain('להתחבר'));
  it('explains unavailable properties', () => expect(funnelErrorMessage('listing_not_available')).toBe('הנכס אינו זמין להפצה כרגע'));
});

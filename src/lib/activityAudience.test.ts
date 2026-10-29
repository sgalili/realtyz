import { describe, expect, it } from 'vitest';
import { activityAudience } from './activityAudience';
describe('personal activity audience', () => {
  it('partners never get the broker view', () => expect(activityAudience(['affiliate', 'user'], false)).toBe('partner'));
  it('explicit partner mode hides broker tools without changing role', () => expect(activityAudience(['managing_broker', 'affiliate'], true)).toBe('partner'));
  it.each(['property_owner', 'property_seeker', 'user'] as const)('private %s has no broker fields', role => expect(activityAudience([role], false)).toBe('private'));
  it('broker core mode retains the standard view', () => expect(activityAudience(['managing_broker', 'affiliate'], false)).toBe('professional'));
});
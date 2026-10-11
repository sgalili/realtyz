import { describe, expect, it } from 'vitest';
import { accountIdentity, isAffiliateOnlyAccount } from './accountMode';
import type { AppRole } from '@/hooks/useUserRole';

describe('universal account identity', () => {
  it.each([
    ['developer', 'יזם', '/developer-dashboard'],
    ['agent', 'מתווך', '/'],
    ['managing_broker', 'מתווך', '/'],
    ['property_owner', 'מפרסם', '/owner/properties'],
    ['property_seeker', 'פרטי', '/public-listings'],
    ['user', 'פרטי', '/public-listings'],
  ] as const)('retains %s identity with additive partner membership', (role, label, home) => {
    const before = accountIdentity([role]);
    const after = accountIdentity([role, 'affiliate']);
    expect(before).toEqual({ label, home, canSwitch: true });
    expect(after).toEqual(before);
    expect(isAffiliateOnlyAccount([role, 'affiliate'])).toBe(false);
  });
  it('never offers broker/developer identity to an affiliate-only account', () => {
    expect(accountIdentity(['affiliate'])).toEqual({ label: 'שותף', home: '/affiliate-network', canSwitch: false });
    expect(isAffiliateOnlyAccount(['affiliate'])).toBe(true);
    expect(accountIdentity([] as AppRole[]).canSwitch).toBe(false);
  });
});
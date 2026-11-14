import { describe, it, expect } from 'vitest';
import { emptyAdminUserFilters, hasNewAdminItems, matchesAdminUser } from './adminUserFilters';
describe('user management rules', () => {
  it('hides action queues with exactly zero new items', () => {
    expect(hasNewAdminItems(0)).toBe(false);
    expect(hasNewAdminItems(undefined)).toBe(false);
    expect(hasNewAdminItems(1)).toBe(true);
  });
  it('combines search with saved role, access and gender filters', () => {
    const p = { full_name: 'דנה לוי', city: 'הרצליה', gender: 'female', is_suspended: false };
    expect(matchesAdminUser(p, ['agent'], 'הרצליה', { role: 'agent', status: 'active', gender: 'female' })).toBe(true);
    expect(matchesAdminUser(p, ['affiliate'], '', { ...emptyAdminUserFilters, role: 'agent' })).toBe(false);
    expect(matchesAdminUser(p, ['agent'], '', { ...emptyAdminUserFilters, status: 'suspended' })).toBe(false);
    expect(matchesAdminUser(p, ['agent'], '', { ...emptyAdminUserFilters, gender: 'male' })).toBe(false);
    expect(matchesAdminUser(p, ['agent'], 'missing', emptyAdminUserFilters)).toBe(false);
  });
});
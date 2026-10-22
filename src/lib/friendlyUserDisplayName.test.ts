import { describe, expect, it } from 'vitest';
import { friendlyUserDisplayName, isSyntheticEmail } from './friendlyUserDisplayName';

describe('personal display names', () => {
  it('discards internal aliases even when legacy metadata stored one as the name', () => {
    expect(friendlyUserDisplayName({ user_metadata: { full_name: 'p972537759408@phone.toraff.invalid', name: 'שי גלילי' } })).toBe('שי גלילי');
    expect(isSyntheticEmail('p972537759408@phone.toraff.invalid')).toBe(true);
  });
  it('does not replace missing names with login credentials', () => {
    expect(friendlyUserDisplayName({ email: 'p972537759408@phone.toraff.invalid', phone: '972537759408' })).toBe('ללא שם');
  });
});
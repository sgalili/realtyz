import { describe, expect, it } from 'vitest';
import { userDeletionProtection } from '../../supabase/functions/_shared/userDeletionPolicy';

describe('Super Admin deletion protections', () => {
  it('protects the signed-in account', () => expect(userDeletionProtection('shay', 'shay', [])).toBe('skipped_self'));
  it('protects every Super Admin account', () => expect(userDeletionProtection('shay', 'other', ['super_admin'])).toBe('skipped_super_admin'));
  it('allows deleting a different ordinary account', () => expect(userDeletionProtection('shay', 'barak', ['agent'])).toBeNull());
});
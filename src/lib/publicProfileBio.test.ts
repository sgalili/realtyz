import { describe, expect, it } from 'vitest';
import { publicProfileBio } from './publicProfileBio';
describe('public biography eligibility', () => {
  it('hides custom bios below 50 characters', () => expect(publicProfileBio('a'.repeat(49))).toBeNull());
  it('shows a custom bio at exactly 50 characters', () => expect(publicProfileBio('a'.repeat(50))).toBe('a'.repeat(50)));
  it('shows imported biographies without a minimum length', () => expect(publicProfileBio(null, 'מקור יד2')).toBe('מקור יד2'));
});
import { describe, expect, it } from 'vitest';
import { authFormReady, validFullName } from './authFormValidation';

describe('auth form validation', () => {
  it('requires at least two words', () => {
    expect(validFullName('גלילי')).toBe(false);
    expect(validFullName('שי גלילי')).toBe(true);
  });
  it('requires at least two letters in every word', () => {
    expect(validFullName('ש גלילי')).toBe(false);
    expect(validFullName('שי ג')).toBe(false);
    expect(validFullName('12 גלילי')).toBe(false);
    expect(validFullName('שי גלילי')).toBe(true);
  });
  it('handles whitespace and rejects email or overlong names', () => {
    expect(validFullName('  שי   גלילי  ')).toBe(true);
    expect(validFullName('שי test@example.com')).toBe(false);
    expect(validFullName(`שי ${'ג'.repeat(200)}`)).toBe(false);
  });
  it('blocks incomplete signup but allows valid sign-in without name or type', () => {
    const base = { signup: true, signupType: 'partner', fullName: 'שי גלילי', brokerReady: true, identifier: '050-1234567', phone: true };
    expect(authFormReady(base)).toBe(true);
    expect(authFormReady({ ...base, fullName: '' })).toBe(false);
    expect(authFormReady({ ...base, signupType: '' })).toBe(false);
    expect(authFormReady({ ...base, brokerReady: false })).toBe(false);
    expect(authFormReady({ ...base, identifier: '050-12' })).toBe(false);
    expect(authFormReady({ ...base, signup: false, fullName: '', signupType: '' })).toBe(true);
  });
});
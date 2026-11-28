import { describe, expect, it } from 'vitest';
import { buildRitaDynamicVariables, normalizeRitaGender, RITA_TEST_MAX_SECONDS } from './ritaVoice';

describe('Rita gender and test-call rules', () => {
  it('defaults unknown gender to male', () => {
    expect(normalizeRitaGender(undefined)).toBe('male');
    expect(normalizeRitaGender('')).toBe('male');
  });
  it('supports female when set', () => {
    expect(normalizeRitaGender('female')).toBe('female');
    expect(normalizeRitaGender('אישה')).toBe('female');
  });
  it('passes first name, gender and test flag', () => {
    const v = buildRitaDynamicVariables({ fullName: 'דנה כהן', source: 't', gender: 'female', isTestCall: true });
    expect(v.first_name).toBe('דנה');
    expect(v.lead_name).toBe('דנה');
    expect(v.gender).toBe('female');
    expect(v.is_test_call).toBe(true);
  });
  it('caps a test call at one minute plus a two minute extension', () => {
    expect(RITA_TEST_MAX_SECONDS).toBe(180);
  });
});

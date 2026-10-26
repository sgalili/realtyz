import { describe, it, expect } from 'vitest';
import { smsSignupSchema, signupDetailsValid, israeliMobile, signupTypes, formatAuthMobile } from './smsSignup';
describe('SMS signup rules', () => {
  it('limits auth mobile entry to ten digits with a hyphen after digit three', () => {
    expect(formatAuthMobile('054123456789')).toBe('054-1234567');
    expect(formatAuthMobile('054-1234567')).toBe('054-1234567');
    expect(formatAuthMobile('05')).toBe('05');
  });
  const valid = { firstName: 'שי', lastName: 'גלילי', gender: 'male', phone: '+972541234567' };
  it('requires two letters only in each separate name', () => {
    expect(smsSignupSchema.safeParse(valid).success).toBe(true);
    for (const firstName of ['ש', 'שי2', 'שי גל']) expect(smsSignupSchema.safeParse({ ...valid, firstName }).success).toBe(false);
    for (const lastName of ['ג', 'גלילי3']) expect(smsSignupSchema.safeParse({ ...valid, lastName }).success).toBe(false);
  });
  it('requires selected gender', () => { expect(smsSignupSchema.safeParse({ ...valid, gender: '' }).success).toBe(false); });
  it('accepts local and international Israeli mobile only', () => {
    expect(israeliMobile.parse('054-1234567')).toBe('972541234567');
    expect(israeliMobile.parse('+972 54 1234567')).toBe('972541234567');
    expect(israeliMobile.safeParse('03-1234567').success).toBe(false);
    expect(israeliMobile.safeParse('+15551234567').success).toBe(false);
    expect(israeliMobile.safeParse('054abc1234567').success).toBe(false);
  });
  it('offers exactly the five required types', () => { expect([...signupTypes]).toEqual(['property_owner', 'property_seeker', 'broker', 'developer', 'partner']); });
  it.each([
    ['property_owner', { property_area: 'תל אביב', property_type: 'דירה' }],
    ['property_seeker', { search_area: 'חיפה', budget: '5000' }],
    ['broker', { office_name: 'משרד', service_area: 'חיפה' }],
    ['developer', { company_name: 'חברה', main_project: 'פרויקט' }],
    ['partner', { marketing_channel: 'פייסבוק' }],
  ] as const)('requires essential fields for %s', (type, fields) => {
    expect(signupDetailsValid(type, fields)).toBe(true);
    expect(signupDetailsValid(type, {})).toBe(false);
  });
  it('requires positive buyer budget', () => { expect(signupDetailsValid('property_seeker', { search_area: 'חיפה', budget: '0' })).toBe(false); });
});
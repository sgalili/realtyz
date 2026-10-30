import { describe, expect, it } from 'vitest';
import { profileFieldChange, type ProfileContacts } from './profileFieldSave';

const saved: ProfileContacts = { fullName: 'Original', city: 'חיפה', emails: [{ id: 'e', value: 'owner@toraff.co.il' }], whatsapps: [{ id: 'w', value: '0501234567' }], phones: [{ id: 'p', value: '0521234567' }] };
describe('isolated profile field saves', () => {
  it('updates only the confirmed city without saving other fields', () => {
    const result = profileFieldChange('city', 'תל אביב', saved);
    expect(result.patch).toEqual({ city: 'תל אביב' });
    expect(result.contacts.fullName).toBe('Original');
    expect(result.contacts.emails).toEqual(saved.emails);
  });
  it('updates gender without modifying contact details', () => {
    const result = profileFieldChange('gender', 'female', saved);
    expect(result.patch).toEqual({ gender: 'female' });
    expect(result.contacts).toEqual(saved);
  });
  it('persists a confirmed primary email without touching phone or identity', () => {
    expect(profileFieldChange('emails', [{ id: 'e', value: 'new@toraff.co.il' }], saved).patch).toEqual({ email: 'new@toraff.co.il' });
  });
  it('deleting a WhatsApp number uses the saved phone fallback', () => {
    expect(profileFieldChange('whatsapps', [], saved).patch).toEqual({ phone: '0521234567' });
  });
});
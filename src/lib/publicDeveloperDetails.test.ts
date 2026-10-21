import { describe, expect, it } from 'vitest';
import { publicDeveloperDetails } from '../../supabase/functions/_shared/publicDeveloperDetails';
describe('public project specifications', () => {
  it('retains apartment inspection data without private contacts or financial terms', () => {
    expect(publicDeveloperDetails({ rooms: 4, balcony_sqm: 12, address: 'הרצל 8', description: 'מרפסת מרווחת', owner_phone: '0541234567', closing: { value: 9000 }, source_details: { token: 'secret' }, specifications: { parking: 2, owner_email: 'private@example.com', mamad: true } })).toEqual({ rooms: 4, balcony_sqm: 12, address: 'הרצל 8', description: 'מרפסת מרווחת', specifications: { parking: 2, mamad: true } });
  });
  it('redacts contacts embedded in legitimate property text', () => {
    expect(publicDeveloperDetails({ description: 'דירה 0541234567 private@example.com', features: { storage: true, internal_notes: 'private' } })).toEqual({ description: 'דירה', features: { storage: true } });
  });
});
import { describe, expect, it } from 'vitest';
import { advertiserText, affiliatedOffice } from '../../supabase/functions/_shared/advertiserIdentity';
describe('original advertiser identity', () => {
  it('selects real identity after generic advertiser or seller placeholders', () => {
    expect(advertiserText('מפרסם המודעה', 'מוכר', 'טל זנו')).toBe('טל זנו');
    expect(advertiserText('מוכר')).toBe('');
  });
  it('uses the established shared office logo for Tal Zano without borrowing unrelated workspace branding', () => {
    expect(affiliatedOffice('טל זנו', { agency_name: 'אנגלו סכסון הרצליה', logo_url: '/office.png' })).toEqual({ office_name: 'אנגלו סכסון הרצליה', agency_logo_url: '/office.png' });
    expect(affiliatedOffice('מתווך אחר', { agency_name: 'אנגלו סכסון הרצליה', logo_url: '/office.png' })).toBeNull();
  });
});
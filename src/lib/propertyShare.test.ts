import { describe, expect, it, vi } from 'vitest';
import { personalizeShareParam, shareProperties } from './propertyShare';
import { sendViaOfficialWaba } from './officialWa';
import type { UnifiedResult } from './propertySearch';

vi.mock('./officialWa', () => ({ sendViaOfficialWaba: vi.fn(async () => ({ ok: true })), openWhatsAppContactPicker: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));

describe('personalizeShareParam', () => {
  it('sends exactly the prepared link and named preview parameters through the official gateway', async () => {
    const r = { key: 'listing', address: 'הרצל 10', price: 8000, listing_type: 'rent' } as UnifiedResult;
    const url = 'https://toraff.co.il/share/property/prepared';
    const params = ['דנה', `הרצל 10 · ${url}`, '8,000 / לחודש'];
    await shareProperties([r], 'whatsapp', { name: 'דנה כהן', phone: '0501234567' }, { name: 'new_exclusive_listing_alert', language: 'he', body_text: '{{first_name}} {{property_address}} {{property_price}}', body_params: params }, [{ r, url }]);
    expect(sendViaOfficialWaba).toHaveBeenCalledWith(expect.objectContaining({ phone_number: '972501234567', template: { name: 'new_exclusive_listing_alert', language: 'he', components: [{ type: 'body', parameters: [
      { type: 'text', parameter_name: 'first_name', text: 'דנה' },
      { type: 'text', parameter_name: 'property_address', text: `הרצל 10 · ${url}` },
      { type: 'text', parameter_name: 'property_price', text: '8,000 / לחודש' },
    ] }] } }));
  });
  const ctx = { name: 'דנה כהן', property: 'הרצל 10, תל אביב', link: 'https://toraff.co.il/share/property/abc', message: 'שלום דנה 👋' };

  it('fills the recipient name token', () => {
    expect(personalizeShareParam('שלום [שם_פרטי]!', ctx)).toBe('שלום דנה כהן!');
    expect(personalizeShareParam('היי [שם],', ctx)).toBe('היי דנה כהן,');
  });

  it('fills the property and link tokens', () => {
    expect(personalizeShareParam('[נכס] · [קישור]', ctx)).toBe('הרצל 10, תל אביב · https://toraff.co.il/share/property/abc');
  });

  it('leaves plain text untouched and blanks unknown recipients', () => {
    expect(personalizeShareParam('הודעה קבועה', ctx)).toBe('הודעה קבועה');
    expect(personalizeShareParam('שלום [שם_פרטי]', { name: null })).toBe('שלום ');
  });
});

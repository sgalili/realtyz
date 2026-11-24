import { describe, expect, it } from 'vitest';
import { firstContactBody, fillFirstContact } from '../../supabase/functions/_shared/brokerInvitationTemplate';

describe('first-contact invitation', () => {
  it('includes the first name and Yad2 address', () => {
    const text = fillFirstContact(firstContactBody('email'), 'דנה', 'הרצל 10, תל אביב');
    expect(text).toContain('היי דנה');
    expect(text).toContain('בהרצל 10, תל אביב');
  });
  it('never mentions demo or carries a link, and offers opt-out', () => {
    for (const channel of ['email', 'whatsapp'] as const) {
      const text = fillFirstContact(firstContactBody(channel), 'דנה', null);
      expect(text).not.toMatch(/דמו|הדגמה|https?:|\{authLink\}/);
      expect(text).toContain('הסרה');
      expect(text).not.toContain('{propertyAddress}');
    }
  });
});

describe('fixed first-outreach WhatsApp template', () => {
  it('offers free access and is signed by Rita', async () => {
    const { FIRST_CONTACT_WHATSAPP } = await import('../../supabase/functions/_shared/brokerInvitationTemplate');
    expect(FIRST_CONTACT_WHATSAPP.startsWith('היי {{1}},')).toBe(true);
    expect(FIRST_CONTACT_WHATSAPP).toContain('ראיתי את המודעה שלך ב{{2}}');
    expect(FIRST_CONTACT_WHATSAPP).toContain('גישה בחינם');
    expect(FIRST_CONTACT_WHATSAPP.trim().endsWith('ריטה | TORAFF')).toBe(true);
  });
});

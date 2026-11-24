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

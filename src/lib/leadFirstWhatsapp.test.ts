import { describe, expect, it } from 'vitest';
import { FIRST_CONTACT_BODY, FIRST_CONTACT_TEMPLATE, firstContactTemplateReady, contactFirstName } from '../../supabase/functions/_shared/leadFirstWhatsapp';

const template = { name: FIRST_CONTACT_TEMPLATE, body_text: FIRST_CONTACT_BODY, status: 'APPROVED', variable_count: 1, has_header_variable: false };
describe('first WhatsApp contact', () => {
  it('requires the dedicated approved opt-in template', () => {
    expect(firstContactTemplateReady(template)).toBe(true);
    expect(firstContactTemplateReady({ ...template, status: 'PENDING' })).toBe(false);
    expect(firstContactTemplateReady({ ...template, name: 'hello_world' })).toBe(false);
    expect(firstContactTemplateReady(null)).toBe(false);
  });
  it('fills exactly the first name without changing fixed template text', () => {
    expect(contactFirstName('  דנה ישראלי  ')).toBe('דנה');
    expect(firstContactTemplateReady({ ...template, variable_count: 2 })).toBe(false);
    expect(firstContactTemplateReady({ ...template, body_text: 'שלום {{1}}' })).toBe(false);
  });
});
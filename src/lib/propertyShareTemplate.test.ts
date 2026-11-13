import { describe, expect, it } from 'vitest';
import { propertyShareTemplate } from './propertyShareTemplate';
import type { MetaWaTemplate } from '@/hooks/useMetaWaTemplates';
import type { UnifiedResult } from './propertySearch';

const template: MetaWaTemplate = { name: 'new_lead_property_match2', language: 'he', status: 'APPROVED', category: 'MARKETING', has_header_variable: false, variable_count: 3, body_text: 'שלום {{1}}, יש לנו נכס חדש מ- TORAFF ב{{2}} ({{3}}) שמתאים בדיוק לדרישות שחיפשת. שנמשיך כאן או נעבור לווטסאפ?' };
const r = { key: 'listing1', address: 'הרצל 10', city: 'תל אביב', price: 8000, listing_type: 'rent' } as UnifiedResult;
const url = 'https://toraff.co.il/share/property/abc';
describe('automatic property share templates', () => {
  it('populates the existing named property alert with price and landing link without editing its fixed text', () => {
    const named = { ...template, name: 'new_exclusive_listing_alert', body_text: 'היי {{first_name}}, נכס חדש בלעדי ב{{property_address}} בדיוק התפרסם במחיר {{property_price}} ₪! אפשר ליצור איתי קשר לפרטים נוספים ותמונות.' };
    const result = propertyShareTemplate([named], [{ r, url }], 'דנה כהן');
    expect(result?.selection.body_params).toEqual(['דנה', `הרצל 10 · תל אביב · ${url}`, '8,000 / לחודש']);
    expect(result?.preview).toContain(url);
    expect(result?.preview).toContain('אפשר ליצור איתי קשר לפרטים נוספים ותמונות.');
  });
  it('fills first name, address, monthly price and the exact prepared landing URL', () => {
    const result = propertyShareTemplate([template], [{ r, url }], 'דנה כהן');
    expect(result?.selection.body_params[0]).toBe('דנה');
    expect(result?.selection.body_params[1]).toContain('הרצל 10');
    expect(result?.selection.body_params[2]).toBe(`₪8,000 / לחודש · ${url}`);
    expect(result?.preview).toContain(url);
    expect(result?.preview).not.toContain('{{');
    expect(result?.selection.body_params.some(p => /[\n\t]/.test(p))).toBe(false);
  });
  it('does not use test, pending or incompatible templates', () => {
    expect(propertyShareTemplate([{ ...template, name: 'hello_world' }], [{ r, url }], 'דנה')).toBeNull();
    expect(propertyShareTemplate([{ ...template, status: 'PENDING' }], [{ r, url }], 'דנה')).toBeNull();
    expect(propertyShareTemplate([{ ...template, body_text: 'שלום {{unknown}}' }], [{ r, url }], 'דנה')).toBeNull();
  });
  it('includes every selected property link without losing batch items', () => {
    const secondUrl = 'https://toraff.co.il/share/property/def';
    const result = propertyShareTemplate([template], [{ r, url }, { r: { ...r, key: 'listing2', price: 9000 }, url: secondUrl }], 'דנה');
    expect(result?.preview).toContain(url);
    expect(result?.preview).toContain(secondUrl);
    expect(result?.preview).toContain('₪9,000 / לחודש');
  });
});
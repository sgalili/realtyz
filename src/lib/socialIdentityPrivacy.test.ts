import { describe, expect, it } from 'vitest';
import { anonymousSocialText } from '../../supabase/functions/_shared/socialIdentityPrivacy';
import { publicUrl } from './publicUrl';

describe('anonymous partner redistribution', () => {
  it('removes partner name, phone and email while retaining property facts', () => {
    const result = anonymousSocialText('דירת 4 חדרים, ₪2,500,000\nדנה כהן | 054-1234567\npartner@example.com', ['דנה כהן']);
    expect(result).not.toContain('דנה כהן');
    expect(result).not.toContain('054');
    expect(result).not.toContain('partner@example.com');
    expect(result).toContain('4 חדרים');
    expect(result).toContain('₪2,500,000');
  });
  it('removes international contact numbers but retains tracking links', () => {
    const result = anonymousSocialText('לפרטים +972 54 123 4567\nhttps://toraff.co.il/r/abc234');
    expect(result).not.toContain('123 4567');
    expect(result).toContain('https://toraff.co.il/r/abc234');
  });
  it('generates links on toraff.co.il regardless of preview origin', () => {
    expect(publicUrl('/r/abc234')).toBe('https://toraff.co.il/r/abc234');
  });
});
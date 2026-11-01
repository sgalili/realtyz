import { describe, expect, it } from 'vitest';
import { agencyUrlForRequest, isYad2AgencyUrl, isYad2ItemUrl } from '@/lib/yad2ImportLinks';

describe('Yad2 import link rules', () => {
  it('accepts single-ad item pages and short share links, rejects office pages', () => {
    expect(isYad2ItemUrl('https://www.yad2.co.il/realestate/item/apartment-in-tel-aviv/123456789')).toBe(true);
    expect(isYad2ItemUrl('https://www.yad2.co.il/item/123456789')).toBe(true);
    expect(isYad2ItemUrl('https://www.yad2.co.il/s/abc123')).toBe(true);
    expect(isYad2ItemUrl('https://www.yad2.co.il/realestate/agency/12345')).toBe(false);
    expect(isYad2ItemUrl('')).toBe(false);
  });
  it('accepts office pages only in the shape the discovery function reads', () => {
    expect(isYad2AgencyUrl('https://www.yad2.co.il/realestate/agency/12345')).toBe(true);
    expect(isYad2AgencyUrl('yad2.co.il/realestate/agency/12345')).toBe(true);
    expect(isYad2AgencyUrl('https://www.yad2.co.il/realestate/agency/')).toBe(false);
    expect(isYad2AgencyUrl('https://www.yad2.co.il/realestate/item/12345')).toBe(false);
    expect(isYad2AgencyUrl('https://example.com/realestate/agency/12345')).toBe(false);
  });
  it('sends the office page as a full https URL the discovery function accepts', () => {
    expect(agencyUrlForRequest('  www.yad2.co.il/realestate/agency/12345 ')).toBe('https://www.yad2.co.il/realestate/agency/12345');
    expect(agencyUrlForRequest('https://www.yad2.co.il/realestate/agency/12345')).toBe('https://www.yad2.co.il/realestate/agency/12345');
  });
});

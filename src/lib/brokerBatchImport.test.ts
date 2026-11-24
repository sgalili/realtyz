import { describe, it, expect } from 'vitest';
import { batchListingUrls, batchPhone, parseBrokerBatch } from '../../supabase/functions/_shared/brokerBatchImport';

describe('broker batch import', () => {
  it('keeps only exact Yad2 ad links, at most 10', () => {
    const urls = ['https://www.yad2.co.il/realestate/item/abc123', 'https://evil.com/realestate/item/x', ...Array.from({ length: 12 }, (_, i) => `https://www.yad2.co.il/realestate/item/id${i}x`)];
    const out = batchListingUrls(urls);
    expect(out[0]).toBe('https://www.yad2.co.il/realestate/item/abc123');
    expect(out).toHaveLength(10);
    expect(out.some(u => u.includes('evil'))).toBe(false);
  });
  it('normalizes phones', () => { expect(batchPhone('052-297-3500')).toBe('972522973500'); expect(batchPhone('03-123')).toBeNull(); });
  it('honors an explicit fifty-property queue limit without a hidden ten-property cap', () => {
    const urls = Array.from({ length: 55 }, (_, i) => `https://www.yad2.co.il/realestate/item/item${i}`);
    expect(batchListingUrls(urls, 50)).toHaveLength(50);
    expect(batchListingUrls(urls, 5)).toHaveLength(5);
  });
  it('reads alternate key names', () => {
    const [r] = parseBrokerBatch(JSON.stringify({ brokers: [{ broker_name: 'טל זנו', mobile: '0522973500', license: '12345', agency: 'Anglo Saxon', listings: [{ url: 'https://www.yad2.co.il/realestate/item/abc' }] }] }));
    expect(r).toMatchObject({ full_name: 'טל זנו', license_number: '12345', office_name: 'Anglo Saxon', listing_urls: ['https://www.yad2.co.il/realestate/item/abc'] });
  });
});

import { describe, expect, it } from 'vitest';
import { load } from 'cheerio';
import { parseAgencies, parseAgencyProfile, agencyDirectoryUrl, agencyDirectoryQuery } from '../../supabase/functions/_shared/yad2Agencies';
import { advanceSearchPoint, freshImportCheckpoint } from '../../supabase/functions/_shared/brokerImportQueue';

const page = (pageProps: unknown) => load(`<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps } })}</script>`);

describe('current Yad2 agencies directory', () => {
  it('reads realtor-index offices as individual agency profile links with their volume', () => {
    const { results, children } = parseAgencies(page({ data: {
      'realtor-index': [{ office_name: 'משרד א', CustID: 111, total: 40, office_logo_url: '//images.yad2.co.il/a.jpg' }],
      geographical: [{ nextLevelName: 'topArea', id: 19 }, { nextLevelName: 'topArea', id: 2 }],
    } }), agencyDirectoryUrl(''));
    expect(results[0].source_url).toBe('https://www.yad2.co.il/realestate/agency/111');
    expect(results[0].active_listing_count).toBe(40);
    expect(children).toEqual(['topArea=19', 'topArea=2']);
  });
  it('builds deeper geography children from the current node', () => {
    const { children } = parseAgencies(page({ data: { 'realtor-index': [], geographical: [{ nextLevelName: 'area', id: 17 }] } }), agencyDirectoryUrl('topArea=19'));
    expect(children).toEqual(['topArea=19&area=17']);
    expect(agencyDirectoryQuery('area=17')).toBe('');
  });
  it('takes identity only from the broker whose license matches the office license, max 10 ads', () => {
    const feed = Array.from({ length: 12 }, (_, i) => ({ token: `tok${i}abc`, additionalDetails: { property: { text: 'דירה' } } }));
    const row = parseAgencyProfile(page({ agencyData: { details: { officeName: 'משרד א', licenseNumber: '3172967' }, brokers: [{ name: 'אחר', licenseNumber: '1111111' }, { name: 'דנה כהן', licenseNumber: '3172967' }], feed, pagination: { total: 80 } } }), 'https://www.yad2.co.il/realestate/agency/111', 10).results[0];
    expect(row.owner_name).toBe('דנה כהן');
    expect(row.publisher.broker_license_number).toBe('3172967');
    expect(row.listing_urls).toHaveLength(10);
    expect(row.active_listing_count).toBe(80);
  });
  it('never assigns a license when no broker matches it', () => {
    // Identity must remain source-bound even when extra property pages are requested.
    const row = parseAgencyProfile(page({ agencyData: { details: { officeName: 'משרד', licenseNumber: '3172967' }, brokers: [{ name: 'אחר', licenseNumber: '1111111' }], feed: [{ token: 'abcd1234' }] } }), 'https://www.yad2.co.il/realestate/agency/111').results[0];
    expect(row.publisher.broker_license_number).toBeUndefined();
    expect(row.listing_urls).toEqual([]);
  });
  it('continues beyond the five-ad feed using the source total when totalPages is absent', () => {
    const result = parseAgencyProfile(page({ agencyData: { details: { licenseNumber: '3172967' }, brokers: [{ name: 'דנה כהן', licenseNumber: '3172967' }], feed: Array.from({ length: 5 }, (_, i) => ({ token: `abcd${i}` })), pagination: { total: 10 } } }), 'https://www.yad2.co.il/realestate/agency/111', 10);
    expect('total_pages' in result ? result.total_pages : null).toBe(2);
    expect(result.results[0]?.listing_urls).toHaveLength(5);
  });
  it('keeps scanning while geography nodes remain, then completes', () => {
    const c: any = { ...freshImportCheckpoint(), directoryQueue: ['topArea=2'], directoryVisited: 1 };
    advanceSearchPoint(c); expect(c.phase).toBe('scanning');
    c.directoryQueue = []; advanceSearchPoint(c); expect(c.phase).toBe('completed');
  });
});

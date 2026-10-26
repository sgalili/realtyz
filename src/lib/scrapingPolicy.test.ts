import { describe, expect, it } from 'vitest';
import { DEVELOPER_CACHE_SECONDS, MAX_DEVELOPER_PAGES, uniqueScrapingUrls } from '../../supabase/functions/_shared/scrapingPolicy';
describe('scraping work policy', () => {
  it('reuses developer pages for 24 hours without a longer freshness window', () => expect(DEVELOPER_CACHE_SECONDS).toBe(86400));
  it('bounds developer imports to twenty pages', () => expect(MAX_DEVELOPER_PAGES).toBe(20));
  it('collapses identical pages despite fragment and parameter order', () => expect(uniqueScrapingUrls(['https://www.yad2.co.il/x?b=2&a=1#one','https://www.yad2.co.il/x?a=1&b=2#two'])).toEqual(['https://www.yad2.co.il/x?a=1&b=2']));
});
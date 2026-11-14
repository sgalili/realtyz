import { describe, expect, it } from 'vitest';
import { DEVELOPER_CACHE_SECONDS, uniqueScrapingUrls } from '../../supabase/functions/_shared/scrapingPolicy';
describe('scraping work policy', () => {
  it('reuses developer pages for 24 hours without a longer freshness window', () => expect(DEVELOPER_CACHE_SECONDS).toBe(86400));
  it('collapses identical pages despite fragment and parameter order', () => expect(uniqueScrapingUrls(['https://www.yad2.co.il/x?b=2&a=1#one','https://www.yad2.co.il/x?a=1&b=2#two'])).toEqual(['https://www.yad2.co.il/x?a=1&b=2']));
  it('does not truncate a paid developer import to a fixed project quantity', () => {
    const urls = Array.from({ length: 35 }, (_, index) => `https://www.yad2.co.il/yad1/project/${index + 1}`);
    expect(uniqueScrapingUrls(urls)).toHaveLength(35);
  });
});

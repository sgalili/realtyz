export const DEVELOPER_CACHE_SECONDS = 24 * 60 * 60;
export const MAX_DEVELOPER_PAGES = 20;
export function uniqueScrapingUrls(urls: string[]) {
  return Array.from(new Set(urls.map(value => {
    const url = new URL(value);
    url.hash = '';
    url.searchParams.sort();
    return url.href;
  })));
}
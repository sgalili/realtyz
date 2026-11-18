import { developerImportUrl, developerImportPageKind } from './yad2DeveloperImport.ts';

export const DEVELOPER_DIRECTORY_URL = 'https://www.yad2.co.il/yad1/developers';
export function developerDirectoryUrl(value: string): string | null {
  try {
    const url = new URL(value, DEVELOPER_DIRECTORY_URL);
    if (url.protocol !== 'https:' || url.hostname !== 'www.yad2.co.il' || !/^\/yad1\/developers\/?$/.test(url.pathname)) return null;
    const page = Number(url.searchParams.get('page') ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 100) return null;
    return page === 1 ? DEVELOPER_DIRECTORY_URL : `${DEVELOPER_DIRECTORY_URL}?page=${page}`;
  } catch { return null; }
}

export function parseDeveloperDirectory(html: string, pageUrl: string) {
  const source = html.replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  const urls = [...new Set((source.match(/(?:https:\/\/(?:www\.)?yad2\.co\.il)?\/yad1\/developers\/\d+/g) ?? [])
    .map(value => developerImportUrl(new URL(value, pageUrl).href)).filter((value): value is string => Boolean(value) && developerImportPageKind(String(value)) === 'profile'))];
  if(!urls.length && /Radware|Verifying your browser|access denied|captcha/i.test(source)) throw new Error('source_blocked');
  const currentPage = Number(new URL(pageUrl).searchParams.get('page') ?? 1);
  const pages = [...source.matchAll(/\/yad1\/developers\/?\?page=(\d+)/g)].map(match => Number(match[1]));
  const next = pages.filter(page => page > currentPage).sort((a, b) => a - b)[0];
  return { urls, next_url: next ? developerDirectoryUrl(`${DEVELOPER_DIRECTORY_URL}?page=${next}`) : null };
}
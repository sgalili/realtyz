export function developerImportUrl(value: string): string | null {
  const raw = value.trim().match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/[^\s<>]+/i)?.[0];
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== 'https:' || !/(^|\.)yad2\.co\.il$/i.test(url.hostname) || !/^\/yad1\/developers\/[^/]+\/?$/i.test(url.pathname)) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}
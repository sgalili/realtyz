/** Only this project's public Yad2 cache is reusable; no arbitrary storage hosts. */
export function isPublicYad2Cache(url: URL, projectUrl: string): boolean {
  const project = new URL(projectUrl);
  if (url.protocol !== 'https:' || url.origin !== project.origin || url.username || url.password || url.port || url.search || url.hash) return false;
  const prefix = '/storage/v1/object/public/post-media-cache/yad2/';
  if (!url.pathname.startsWith(prefix)) return false;
  try {
    const segments = url.pathname.slice(prefix.length).split('/').map(decodeURIComponent);
    return segments.length >= 2 && segments.every(segment => !!segment && segment !== '.' && segment !== '..' && !/[\\/\u0000-\u001f]/.test(segment));
  } catch { return false; }
}

export function isTrustedYad2Image(url: URL): boolean {
  return url.protocol === 'https:' && !url.port && !url.username && !url.password &&
    ['yad2.co.il', 'yad2cdn.com', 'yad2.com'].some(host => url.hostname === host || url.hostname.endsWith('.' + host));
}
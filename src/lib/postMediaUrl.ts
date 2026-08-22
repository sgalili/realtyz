// Single source of truth for turning whatever is stored in
// campaign_logs.media_urls / provider_response into a fully-qualified,
// browser-renderable image URL.
//
// The DB historically accumulated three shapes:
//   1. absolute URLs            -> used as-is
//   2. storage keys / relative  -> "posts/<sha1>.png" or "/storage/v1/..."
//   3. serialized JSON objects  -> '{"url":"https://...","mediaType":"link"}'
// Only (1) ever rendered; (2) and (3) produced broken <img> tags.

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
export const POST_MEDIA_BUCKET = 'post-media-cache';

const PUBLIC_BASE = SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public` : '';

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif|mp4|mov|m4v)(\?|#|$)/i;

/** Pull a URL-ish string out of an object shape (Graph API payloads). */
function pickFromObject(value: Record<string, unknown>): string {
  const candidates = [
    (value as any).url,
    (value as any).src,
    (value as any).public_url,
    (value as any).publicUrl,
    (value as any).image?.src,
    (value as any).media?.image?.src,
    (value as any).media?.source,
    (value as any).full_picture,
    (value as any).fullPicture,
    (value as any).path,
    (value as any).storage_path,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
}

/** Normalize any stored value into an absolute URL, or '' when unusable. */
export function toAbsoluteMediaUrl(value: unknown, bucket = POST_MEDIA_BUCKET): string {
  let raw = '';

  if (typeof value === 'string') raw = value.trim();
  else if (value && typeof value === 'object') raw = pickFromObject(value as Record<string, unknown>);
  if (!raw) return '';

  // Serialized JSON that was stored as a plain string.
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      const inner = Array.isArray(parsed)
        ? parsed.map((p) => toAbsoluteMediaUrl(p, bucket)).find(Boolean)
        : toAbsoluteMediaUrl(parsed, bucket);
      return inner || '';
    } catch {
      return '';
    }
  }

  if (/^(data:image\/|blob:)/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;

  if (!PUBLIC_BASE) return '';

  // "/storage/v1/object/public/..." -> prefix the project origin.
  if (raw.startsWith('/storage/v1/')) return `${SUPABASE_URL}${raw}`;
  if (raw.startsWith('storage/v1/')) return `${SUPABASE_URL}/${raw}`;

  const key = raw.replace(/^\/+/, '');
  // "post-media-cache/posts/x.png" (bucket already included) vs "posts/x.png".
  if (key.startsWith(`${bucket}/`)) return `${PUBLIC_BASE}/${key}`;
  return `${PUBLIC_BASE}/${bucket}/${key}`;
}

/** True when the absolute URL is something a browser can actually paint. */
export function isRenderableMediaUrl(url: string): boolean {
  if (!url) return false;
  if (/^(data:image\/|blob:)/i.test(url)) return true;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    // Facebook permalink pages are HTML, not media.
    const pagePaths = ['/photo.php', '/permalink.php', '/share/', '/posts/', '/videos/', '/watch'];
    if ((host === 'facebook.com' || host.endsWith('.facebook.com')) && pagePaths.some((p) => path.startsWith(p))) {
      return false;
    }
    return IMAGE_EXT_RE.test(url)
      || host.includes('fbcdn.net')
      || host.includes('cdninstagram.com')
      || path.includes('/storage/v1/object/');
  } catch {
    return false;
  }
}

/** Resolve + validate in one step. Returns '' when the value is not usable. */
export function resolveMediaUrl(value: unknown, bucket = POST_MEDIA_BUCKET): string {
  const url = toAbsoluteMediaUrl(value, bucket);
  return isRenderableMediaUrl(url) ? url : '';
}

/** Resolve a list, dropping unusable entries and de-duplicating by filename. */
export function resolveMediaUrls(values: unknown, bucket = POST_MEDIA_BUCKET): string[] {
  const source = Array.isArray(values) ? values : values ? [values] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of source) {
    const url = resolveMediaUrl(item, bucket);
    if (!url) continue;
    const key = mediaDedupeKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

export function mediaDedupeKey(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname.split('/').pop() || u.pathname).toLowerCase();
  } catch {
    return url.split('?')[0].toLowerCase();
  }
}

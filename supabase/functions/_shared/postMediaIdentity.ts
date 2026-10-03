import { sha1 } from 'npm:@noble/hashes@1.8.0/sha1';
import { bytesToHex } from 'npm:@noble/hashes@1.8.0/utils';

/** Match a mirror to its original URL without downloading or cloning media. */
export function postMediaIdentity(url: string): string {
  try {
    const parsed = new URL(url.trim());
    const cached = parsed.pathname.match(/\/post-media-cache\/posts\/([a-f0-9]{40})\./i);
    return cached?.[1]?.toLowerCase() ?? bytesToHex(sha1(new TextEncoder().encode(`${parsed.hostname}${parsed.pathname}`)));
  } catch { return url.trim().split(/[?#]/)[0]; }
}

export function dedupePostMedia(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((url) => {
    const key = postMediaIdentity(url);
    if (!url.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
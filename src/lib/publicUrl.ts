/**
 * Canonical public origin for every shareable / outbound link.
 * Lovable preview + published *.lovable.app / *.lovableproject.com hosts require
 * a Lovable login, so any link built from window.location.origin while working
 * inside the editor breaks for recipients. Always emit our own domain instead.
 */
export const PUBLIC_SITE_ORIGIN = 'https://realtyz.co.il';

const INTERNAL_HOST_RE = /(lovable\.app|lovableproject\.com|lovable\.dev|localhost|127\.0\.0\.1)$/i;

/** Returns the origin that outbound links must use. */
export function publicOrigin(): string {
  if (typeof window === 'undefined') return PUBLIC_SITE_ORIGIN;
  const host = window.location.hostname;
  return INTERNAL_HOST_RE.test(host) ? PUBLIC_SITE_ORIGIN : window.location.origin;
}

/** Builds an absolute public URL for an in-app path (e.g. `/share/property/abc`). */
export function publicUrl(path: string): string {
  return `${publicOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}

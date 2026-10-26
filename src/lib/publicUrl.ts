/**
 * Canonical public origin for every shareable / outbound link.
 * Lovable preview + published *.lovable.app / *.lovableproject.com hosts require
 * a Lovable login, so any link built from window.location.origin while working
 * inside the editor breaks for recipients. Always emit our own domain instead.
 */
export const PUBLIC_SITE_ORIGIN = 'https://toraff.co.il';

const INTERNAL_HOST_RE = /(lovable\.app|lovableproject\.com|lovable\.dev|localhost|127\.0\.0\.1)$/i;

/** Returns the origin that outbound links must use. */
export function publicOrigin(): string {
  return PUBLIC_SITE_ORIGIN;
}

/** Builds an absolute public URL for an in-app path (e.g. `/share/property/abc`). */
export function publicUrl(path: string): string {
  return `${publicOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}

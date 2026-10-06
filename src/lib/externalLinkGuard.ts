/**
 * Global guard: every click on an anchor pointing to another origin opens as a
 * real new tab with `noopener noreferrer`, so routers/wrappers or the preview
 * iframe can never intercept or block it (Facebook, Instagram, Waze, Maps…).
 * Runs in the capture phase before React handlers and the browser default.
 */
export function isExternalHref(href: string | null | undefined): boolean {
  if (!href) return false;
  try {
    const u = new URL(href, window.location.href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return u.origin !== window.location.origin;
  } catch {
    return false;
  }
}

export function installExternalLinkGuard(): void {
  if (typeof document === 'undefined') return;
  const handler = (e: Event) => {
    const target = e.target as Element | null;
    const a = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || a.hasAttribute('download')) return;
    if (!isExternalHref(a.getAttribute('href'))) return;
    a.target = '_blank';
    const rel = new Set((a.rel || '').split(/\s+/).filter(Boolean));
    rel.add('noopener');
    rel.add('noreferrer');
    a.rel = Array.from(rel).join(' ');
  };
  document.addEventListener('click', handler, true);
  document.addEventListener('auxclick', handler, true);
}

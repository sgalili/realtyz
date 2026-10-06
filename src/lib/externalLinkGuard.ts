import { openExternal } from './openExternal';

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
  const handler = (e: MouseEvent) => {
    const target = e.target as Element | null;
    const a = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!isExternalHref(href)) return;
    a.target = '_blank';
    const rel = new Set((a.rel || '').split(/\s+/).filter(Boolean));
    rel.add('noopener');
    rel.add('noreferrer');
    a.rel = Array.from(rel).join(' ');
    // Plain left click: force an independent popup window, bypassing routers
    // and iframe previews. Modifier/middle clicks keep native tab behaviour.
    if (e.type === 'click' && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openExternal(a.href);
    }
  };
  document.addEventListener('click', handler, true);
  document.addEventListener('auxclick', handler, true);
}

export const EXTERNAL_WINDOW_FEATURES = 'noopener,noreferrer';

/**
 * Opens an external URL as a real top-level tab.
 *
 * A synthetic `<a target="_blank" rel="noopener noreferrer">` click is tried
 * first: inside the preview iframe this is the only path that reliably escapes
 * the restricted embedding context, so pages that refuse framing (Facebook)
 * no longer fail with ERR_BLOCKED_BY_RESPONSE. `window.open` stays as fallback.
 */
export function openExternal(url: string | null | undefined): void {
  if (!url) return;

  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  } catch {
    /* fall through to window.open */
  }

  try {
    window.open(url, '_blank', EXTERNAL_WINDOW_FEATURES);
  } catch {
    /* nothing else we can do */
  }
}

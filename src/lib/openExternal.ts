export const EXTERNAL_WINDOW_FEATURES = 'width=1200,height=800,noopener,noreferrer';

/**
 * Opens an external URL in a true separate browser window (popup) so it is
 * never loaded inside the preview iframe or intercepted by the router —
 * prevents ERR_BLOCKED_BY_RESPONSE from sites that refuse framing.
 * Falls back to a synthetic `_blank` anchor if popups are blocked.
 */
export function openExternal(url: string | null | undefined): void {
  if (!url) return;
  try {
    // With noopener, window.open returns null even on success, so always
    // treat the call as handled unless it throws.
    window.open(url, '_blank', EXTERNAL_WINDOW_FEATURES);
    return;
  } catch {
    /* fall through */
  }
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    /* nothing else we can do */
  }
}

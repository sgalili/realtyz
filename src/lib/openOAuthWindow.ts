/**
 * Opens an OAuth authorization URL without touching `window.top.location`
 * (which throws a sandbox permission error inside the preview iframe).
 *
 * Strategy:
 *  1. `window.open(url, '_blank', 'width=600,height=700')` — popup window.
 *  2. Fallback: a synthetic `<a target="_blank" rel="noopener">` click (new tab).
 *  3. If both are blocked, returns `false` so the caller can render a manual
 *     "open authorization page" link.
 */
export function openOAuthWindow(url: string): boolean {
  if (!url) return false;

  try {
    const popup = window.open(url, '_blank', 'width=600,height=700,noopener=false');
    if (popup && !popup.closed) {
      try { popup.focus(); } catch { /* ignore */ }
      return true;
    }
  } catch {
    /* popup blocked — fall through */
  }

  // New-tab fallback (works when popups with features are blocked).
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}

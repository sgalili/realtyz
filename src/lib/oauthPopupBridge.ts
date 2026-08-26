/**
 * Tiny bridge so the /oauth/callback page can report its result back to the
 * window that started the login when the provider was opened in a popup or a
 * separate tab (see `openOAuthWindow`).
 *
 * The callback page always performs the code exchange itself; this bridge only
 * tells the original tab "we're done" so the connection card refreshes
 * instantly instead of sitting on a loader.
 */
export const OAUTH_BRIDGE_SOURCE = 'realtyz-oauth-callback';

export type OAuthBridgeResult = {
  source: typeof OAUTH_BRIDGE_SOURCE;
  provider: string;
  ok: boolean;
  /** Human-readable page/account name on success. */
  name?: string | null;
  /** Human-readable failure reason. */
  reason?: string | null;
};

/** True when this document was opened by another window of the same app. */
export function isOAuthPopup(): boolean {
  try {
    return !!window.opener && window.opener !== window;
  } catch {
    return false;
  }
}

/**
 * Posts the result to the opener (best effort) and closes this window.
 * Resolves `false` when there is no opener or the window could not close, so
 * the caller can fall back to a normal same-tab redirect.
 */
export function notifyOAuthOpener(result: Omit<OAuthBridgeResult, 'source'>): boolean {
  if (!isOAuthPopup()) return false;
  const payload: OAuthBridgeResult = { ...result, source: OAUTH_BRIDGE_SOURCE };
  try {
    // Same-origin app window: target the exact origin, never '*'.
    window.opener.postMessage(payload, window.location.origin);
  } catch {
    /* opener gone or cross-origin — fall through to the redirect fallback */
  }
  try {
    window.close();
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * Subscribes to callback results. Returns an unsubscribe function.
 * Ignores anything that is not a same-origin bridge message.
 */
export function onOAuthResult(
  provider: string,
  handler: (result: OAuthBridgeResult) => void,
): () => void {
  const listener = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as OAuthBridgeResult | null;
    if (!data || data.source !== OAUTH_BRIDGE_SOURCE) return;
    if (provider && data.provider !== provider) return;
    handler(data);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

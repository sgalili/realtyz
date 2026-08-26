import { useEffect, useState } from 'react';
import { oauthRedirectUri, returnOriginFromOAuthState, storePendingOAuth } from '@/lib/oauthRedirect';

/**
 * Popup landing page for Facebook / Google OAuth.
 *
 * The provider redirects here with `?code=...&state=platform:nonce`. When we are
 * inside a popup the params are forwarded to the opener and the window closes.
 * When there is NO opener (blocked popup, in-app browser, provider forced a
 * full-page redirect) the result is stashed locally and the user is sent back
 * into the app, where the connection card completes the exchange.
 *
 * This page never hangs: any missing parameter, delivery failure or a browser
 * that refuses window.close() falls back to returning the user into the app
 * with the pending result (or a clear error) stashed.
 */
export default function OAuthCallback() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state') ?? '';
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    const returnOrigin = returnOriginFromOAuthState(state);
    // This is the exact URI Meta returned to. Pass it through unchanged to the
    // code exchange: Meta requires byte-for-byte equality with the login URI.
    const redirectUri = params.get('_oauth_redirect_uri') || `${window.location.origin}/oauth/callback`;
    const backPath = state.startsWith('facebook') ? '/profile?tab=connections' : '/profile';

    // Meta may require a canonical whitelisted callback. Bounce from there to
    // the origin that initiated login before touching opener/localStorage, so
    // preview and custom-domain sessions remain intact.
    if (returnOrigin && returnOrigin !== window.location.origin) {
      params.set('_oauth_redirect_uri', redirectUri);
      window.location.replace(`${returnOrigin}/oauth/callback?${params.toString()}`);
      return;
    }

    // Neither a code nor an explicit provider error: the provider (or a stale
    // tab) landed here with nothing usable. Report it instead of spinning.
    const effectiveError = error || (code ? null : 'missing_code');
    const effectiveDescription =
      errorDescription || (code || error ? null : 'הספק לא החזיר קוד אימות. נסה להתחבר שוב.');

    const payload = {
      type: 'realtyz-oauth-callback' as const,
      code,
      state,
      error: effectiveError,
      errorDescription: effectiveDescription,
      redirectUri,
    };

    let delivered = false;
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, window.location.origin);
        delivered = true;
      }
    } catch {
      // Cross-origin opener — fall back to the stashed-result path below.
    }

    if (!delivered) {
      storePendingOAuth({
        code,
        state,
        error: effectiveError,
        errorDescription: effectiveDescription,
        redirectUri: oauthRedirectUri(),
      });
      window.location.replace(backPath);
      return;
    }

    // Give the parent a tick to receive, then close.
    const closeTimer = window.setTimeout(() => {
      try {
        window.close();
      } catch {
        /* ignore */
      }
    }, 250);

    // Some browsers refuse to close a window they did not script-open. After a
    // short grace period, surface a manual way back into the app.
    const stuckTimer = window.setTimeout(() => setStuck(true), 2500);

    return () => {
      window.clearTimeout(closeTimer);
      window.clearTimeout(stuckTimer);
    };
  }, []);

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-background text-foreground"
    >
      <div className="text-center space-y-2">
        {!stuck && (
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        )}
        <p className="text-sm text-muted-foreground">
          {stuck ? 'האימות הושלם. אפשר לסגור את החלון.' : 'מסיים אימות...'}
        </p>
        {stuck ? (
          <button
            type="button"
            onClick={() => window.close()}
            className="text-xs font-medium text-primary underline"
          >
            סגור חלון
          </button>
        ) : (
          <p className="text-[11px] text-muted-foreground/70">חלון זה ייסגר אוטומטית</p>
        )}
      </div>
    </div>
  );
}


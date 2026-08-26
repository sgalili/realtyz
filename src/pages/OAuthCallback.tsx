import { useEffect } from 'react';
import { oauthRedirectUri, storePendingOAuth } from '@/lib/oauthRedirect';

/**
 * Popup landing page for Facebook / Google OAuth.
 *
 * The provider redirects here with `?code=...&state=platform:nonce`. When we are
 * inside a popup the params are forwarded to the opener and the window closes.
 * When there is NO opener (blocked popup, in-app browser, provider forced a
 * full-page redirect) the result is stashed locally and the user is sent back
 * into the app, where the connection card completes the exchange.
 */
export default function OAuthCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state') ?? '';
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    const payload = {
      type: 'realtyz-oauth-callback' as const,
      code,
      state,
      error,
      errorDescription,
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
      storePendingOAuth({ code, state, error, errorDescription, redirectUri: oauthRedirectUri() });
      const back = state.startsWith('facebook') ? '/profile?tab=connections' : '/profile';
      window.location.replace(back);
      return;
    }

    // Give the parent a tick to receive, then close.
    const t = window.setTimeout(() => {
      try {
        window.close();
      } catch {
        /* ignore */
      }
    }, 250);

    return () => window.clearTimeout(t);
  }, []);


  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-background text-foreground"
    >
      <div className="text-center space-y-2">
        <div className="mx-auto h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">מסיים אימות מול Google...</p>
        <p className="text-[11px] text-muted-foreground/70">
          חלון זה ייסגר אוטומטית
        </p>
      </div>
    </div>
  );
}

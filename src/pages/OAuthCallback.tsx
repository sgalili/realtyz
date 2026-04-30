import { useEffect } from 'react';

/**
 * Popup landing page for Google OAuth (and other providers).
 *
 * Google redirects the popup to this route with `?code=...&state=platform:nonce`.
 * We forward those params to the opener via postMessage, then close the popup.
 *
 * This page renders nothing meaningful; it lives only inside the popup window.
 */
export default function OAuthCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state') ?? '';
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    const payload = {
      type: 'kalpiz-oauth-callback' as const,
      code,
      state,
      error,
      errorDescription,
    };

    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, window.location.origin);
      }
    } catch {
      // Cross-origin opener — message will still arrive if origins match.
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

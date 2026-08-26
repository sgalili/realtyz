import { useEffect, useState } from 'react';
import { oauthRedirectUri, returnOriginFromOAuthState, storePendingOAuth } from '@/lib/oauthRedirect';

/**
 * Popup landing page for Facebook / Google OAuth.
 *
 * The provider redirects here with `?code=...&state=platform:nonce` — or, when
 * the user simply confirms an existing grant ("Continue as ..."), with an
 * implicit `#access_token=...` fragment. Both shapes are captured and forwarded
 * to the opener; the popup only closes AFTER the opener acknowledges receipt
 * (or the delivery path falls back to a stashed result).
 */
export default function OAuthCallback() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const pick = (key: string) => search.get(key) ?? hash.get(key);

    const code = pick('code');
    const accessToken = pick('access_token') ?? pick('long_lived_token');
    const state = pick('state') ?? '';
    const error = pick('error') ?? pick('error_code');
    const errorDescription = pick('error_description') ?? pick('error_message');
    const returnOrigin = returnOriginFromOAuthState(state);
    // This is the exact URI Meta returned to. Pass it through unchanged to the
    // code exchange: Meta requires byte-for-byte equality with the login URI.
    const redirectUri = pick('_oauth_redirect_uri') || `${window.location.origin}/oauth/callback`;
    const backPath = state.startsWith('facebook') ? '/profile?tab=connections' : '/profile';

    // Meta may require a canonical whitelisted callback. Bounce from there to
    // the origin that initiated login before touching opener/localStorage, so
    // preview and custom-domain sessions remain intact.
    if (returnOrigin && returnOrigin !== window.location.origin) {
      const forward = new URLSearchParams(search);
      if (code) forward.set('code', code);
      if (accessToken) forward.set('access_token', accessToken);
      if (state) forward.set('state', state);
      forward.set('_oauth_redirect_uri', redirectUri);
      window.location.replace(`${returnOrigin}/oauth/callback?${forward.toString()}`);
      return;
    }

    // Neither a code/token nor an explicit provider error: the provider (or a
    // stale tab) landed here with nothing usable. Report it instead of spinning.
    const hasGrant = !!(code || accessToken);
    const effectiveError = error || (hasGrant ? null : 'missing_code');
    const effectiveDescription =
      errorDescription || (hasGrant || error ? null : 'הספק לא החזיר קוד אימות. נסה להתחבר שוב.');

    const payload = {
      type: 'realtyz-oauth-callback' as const,
      code,
      accessToken,
      state,
      error: effectiveError,
      errorDescription: effectiveDescription,
      redirectUri,
    };

    let delivered = false;
    const postToOpener = () => {
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, window.location.origin);
          return true;
        }
      } catch {
        /* cross-origin opener */
      }
      return false;
    };

    delivered = postToOpener();

    if (!delivered) {
      storePendingOAuth({
        code,
        accessToken,
        state,
        error: effectiveError,
        errorDescription: effectiveDescription,
        redirectUri: oauthRedirectUri(),
      });
      window.location.replace(backPath);
      return;
    }

    // Never close before the parent confirms it received (and started handling)
    // the grant. The parent replies with an ack; until then we keep re-posting.
    let acked = false;
    const onAck = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if ((ev.data as any)?.type !== 'realtyz-oauth-ack') return;
      acked = true;
      window.setTimeout(() => {
        try { window.close(); } catch { /* ignore */ }
      }, 150);
    };
    window.addEventListener('message', onAck);

    // Re-post a few times in case the opener mounted its listener slightly late.
    const retry = window.setInterval(() => {
      if (acked) { window.clearInterval(retry); return; }
      postToOpener();
    }, 400);

    // Hard fallback: if no ack arrives, close anyway so the popup never lingers
    // — the parent watchdog / stashed-result path takes over from there.
    const closeTimer = window.setTimeout(() => {
      window.clearInterval(retry);
      if (!acked) {
        storePendingOAuth({
          code,
          accessToken,
          state,
          error: effectiveError,
          errorDescription: effectiveDescription,
          redirectUri,
        });
      }
      try { window.close(); } catch { /* ignore */ }
    }, 6000);

    // Some browsers refuse to close a window they did not script-open. After a
    // short grace period, surface a manual way back into the app.
    const stuckTimer = window.setTimeout(() => setStuck(true), 4000);

    return () => {
      window.removeEventListener('message', onAck);
      window.clearInterval(retry);
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

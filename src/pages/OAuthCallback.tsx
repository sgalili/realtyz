import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { oauthRedirectUri, returnOriginFromOAuthState, storePendingOAuth } from '@/lib/oauthRedirect';
import { isOAuthPopup, notifyOAuthOpener } from '@/lib/oauthPopupBridge';

/**
 * Full-page OAuth landing page for Facebook / Google.
 *
 * There is NO popup and NO postMessage handshake any more: the provider
 * redirects the main window here with `?code=...&state=platform:nonce` (or an
 * implicit `#access_token=...` when the user just confirms an existing grant),
 * the code is exchanged for a page binding right here in the app context, and
 * the user is then redirected back to the connections screen with an explicit
 * success/error state in the query string.
 */
/** Page-binding logins are exchanged here; other flows stash and hand back. */
const FACEBOOK_PAGE_STATE_PREFIX = 'facebook_page';
const CONNECTIONS_PATH = '/profile?tab=connections';
/** Ceiling for the server-side exchange so the page never spins forever. */
const EXCHANGE_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { window.clearTimeout(timer); resolve(v); },
      (e) => { window.clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Ends the callback: when we were opened in a popup / separate tab, hand the
 * result to the original app window and close. Otherwise (or if closing was
 * blocked) redirect this window to the connections screen.
 */
function finish(path: string, result: { ok: boolean; name?: string | null; reason?: string | null }) {
  if (isOAuthPopup()) {
    notifyOAuthOpener({ provider: 'facebook_page', ...result });
    // If the browser refused to close the window, fall back to a redirect so
    // the user never stares at a spinner.
    window.setTimeout(() => {
      if (!window.closed) window.location.replace(path);
    }, 600);
    return;
  }
  window.location.replace(path);
}

export default function OAuthCallback() {
  const [message, setMessage] = useState('מסיים אימות...');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const search = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const pick = (key: string) => search.get(key) ?? hash.get(key);

      const code = pick('code');
      const accessToken = pick('access_token') ?? pick('long_lived_token');
      const state = pick('state') ?? '';
      const error = pick('error') ?? pick('error_code');
      const errorDescription = pick('error_description') ?? pick('error_message');
      const returnOrigin = returnOriginFromOAuthState(state);
      // Exactly the URI Meta returned to — the exchange requires byte-for-byte
      // equality with the URI used to start the login.
      const redirectUri = pick('_oauth_redirect_uri') || `${window.location.origin}/oauth/callback`;
      // Some provider round-trips (implicit re-confirm, custom-domain hops)
      // drop `state`. Treat a bare grant that came from Facebook as the page
      // flow so the exchange still happens instead of silently stashing.
      const isFacebook =
        state.startsWith(FACEBOOK_PAGE_STATE_PREFIX) ||
        (!state && !!(code || accessToken) && /facebook\.com/i.test(document.referrer || ''));
      const backPath = state.startsWith('facebook') ? CONNECTIONS_PATH : '/profile';

      // Meta may require a canonical whitelisted callback. Bounce from there to
      // the origin that initiated login before touching anything else, so the
      // preview / custom-domain session stays intact.
      if (returnOrigin && returnOrigin !== window.location.origin) {
        const forward = new URLSearchParams(search);
        if (code) forward.set('code', code);
        if (accessToken) forward.set('access_token', accessToken);
        if (state) forward.set('state', state);
        forward.set('_oauth_redirect_uri', redirectUri);
        window.location.replace(`${returnOrigin}/oauth/callback?${forward.toString()}`);
        return;
      }

      const hasGrant = !!(code || accessToken);

      // The provider refused, the user cancelled, or nothing usable arrived.
      if (error || !hasGrant) {
        const reason = errorDescription || error || 'הספק לא החזיר קוד אימות. נסה להתחבר שוב.';
        if (isFacebook) {
          finish(`${CONNECTIONS_PATH}&fb=error&fb_reason=${encodeURIComponent(reason)}`, { ok: false, reason });
          return;
        }
        storePendingOAuth({
          code,
          accessToken,
          state,
          error: error || 'missing_code',
          errorDescription: reason,
          redirectUri: oauthRedirectUri(),
        });
        window.location.replace(backPath);
        return;
      }

      // Personal-profile / calendar / other providers keep the stash-and-return
      // contract: their own card performs the exchange after the redirect.
      if (!isFacebook) {
        storePendingOAuth({ code, accessToken, state, error: null, errorDescription: null, redirectUri });
        window.location.replace(backPath);
        return;
      }

      setMessage('שומר את חיבור עמוד הפייסבוק...');
      try {
        const { data, error: fnError } = await withTimeout(
          supabase.functions.invoke('meta-page-connect', {
            body: {
              action: 'exchange',
              code: code ?? undefined,
              user_access_token: accessToken ?? undefined,
              redirect_uri: redirectUri,
            },
          }),
          EXCHANGE_TIMEOUT_MS,
          'החיבור לפייסבוק לא הושלם בזמן. נסה שוב או חבר ידנית באמצעות טוקן.',
        );
        if (fnError) throw new Error(String(fnError.message ?? fnError));
        if ((data as any)?.error) throw new Error(String((data as any).error));
        const pageName = String((data as any)?.page?.name ?? '');
        if (cancelled) return;
        // Best-effort group import so the publishing targets list is populated.
        void supabase.functions.invoke('fb-groups-import', { body: {} }).catch(() => undefined);
        finish(
          `${CONNECTIONS_PATH}&fb=connected${pageName ? `&fb_page=${encodeURIComponent(pageName)}` : ''}`,
          { ok: true, name: pageName || null },
        );
      } catch (e: any) {
        if (cancelled) return;
        setFailed(true);
        setMessage('החיבור לפייסבוק נכשל. מחזיר אותך להגדרות...');
        const reason = String(e?.message ?? 'unknown');
        finish(`${CONNECTIONS_PATH}&fb=error&fb_reason=${encodeURIComponent(reason)}`, { ok: false, reason });
      }
    };

    void run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-3">
        {!failed && (
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        )}
        <p className="text-sm text-muted-foreground">{message}</p>
        <a href={CONNECTIONS_PATH} className="text-xs font-medium text-primary underline">
          חזרה להגדרות החיבורים
        </a>
      </div>
    </div>
  );
}

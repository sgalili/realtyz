import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { oauthRedirectUri, returnOriginFromOAuthState, storePendingOAuth } from '@/lib/oauthRedirect';
import { isOAuthPopup, notifyOAuthOpener } from '@/lib/oauthPopupBridge';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

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
/** UI safety timeout: show a manual return button if the exchange is not done. */
const SAFETY_UI_TIMEOUT_MS = 4_000;
/** Absolute ceiling for the whole callback: never sit on the loader. */
const HARD_TIMEOUT_MS = 25_000;
/** Google states we can exchange right here in the callback. */
const GOOGLE_STATE_PREFIXES = ['gmail', 'google_calendar'] as const;

type OAuthError = { title: string; detail: string | null } | null;

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
function finish(
  path: string,
  result: { ok: boolean; name?: string | null; reason?: string | null; provider?: string },
  onCloseBlocked?: () => void,
) {
  if (isOAuthPopup()) {
    notifyOAuthOpener({ provider: result.provider ?? 'facebook_page', ...result });
    // If the browser refused to close the window, fall back to a redirect so
    // the user never stares at a spinner.
    window.setTimeout(() => {
      if (!window.closed) {
        if (onCloseBlocked) onCloseBlocked();
        else window.location.replace(path);
      }
    }, 800);
    return;
  }
  window.location.replace(path);
}

export default function OAuthCallback() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [error, setError] = useState<OAuthError>(null);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState('מסיים אימות...');
  const hardTimerRef = useRef<number | null>(null);
  const safetyTimerRef = useRef<number | null>(null);
  const exchangeDoneRef = useRef(false);

  const returnToApp = () => {
    window.location.replace(CONNECTIONS_PATH);
  };

  // Independent mount timer: forces fallback UI after 4 seconds no matter
  // what the async token exchange is doing.
  useEffect(() => {
    safetyTimerRef.current = window.setTimeout(() => {
      setIsLoading(false);
      setHasTimedOut(true);
    }, SAFETY_UI_TIMEOUT_MS);

    return () => {
      if (safetyTimerRef.current) window.clearTimeout(safetyTimerRef.current);
    };
  }, []);

  // Absolute escape hatch: whatever happens, never sit on the loader.
  useEffect(() => {
    hardTimerRef.current = window.setTimeout(() => {
      if (isOAuthPopup()) {
        notifyOAuthOpener({ provider: 'oauth', ok: false, reason: 'timeout' });
        window.setTimeout(() => {
          if (!window.closed) window.location.replace(CONNECTIONS_PATH);
        }, 400);
        return;
      }
      window.location.replace(CONNECTIONS_PATH);
    }, HARD_TIMEOUT_MS);

    return () => {
      if (hardTimerRef.current) window.clearTimeout(hardTimerRef.current);
    };
  }, []);

  // Token exchange logic. Completely separate from the UI safety timer.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const search = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const pick = (key: string) => search.get(key) ?? hash.get(key);

      const code = pick('code');
      const accessToken = pick('access_token') ?? pick('long_lived_token');
      const state = pick('state') ?? '';
      const providerError = pick('error') ?? pick('error_code');
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
      const backPath =
        state.startsWith('facebook') || state.startsWith('gmail') || state.startsWith('google_calendar')
          ? CONNECTIONS_PATH
          : '/profile';

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
      const googlePlatform = GOOGLE_STATE_PREFIXES.find((p) => state.startsWith(p)) ?? null;

      // The provider refused, the user cancelled, or nothing usable arrived.
      if (providerError || !hasGrant) {
        const reason = errorDescription || providerError || 'הספק לא החזיר קוד אימות. נסה להתחבר שוב.';
        if (isFacebook) {
          finish(`${CONNECTIONS_PATH}&fb=error&fb_reason=${encodeURIComponent(reason)}`, { ok: false, reason });
          return;
        }
        if (googlePlatform) {
          if (!cancelled) {
            setIsLoading(false);
            setError({ title: 'החיבור ל-Google נכשל', detail: reason });
          }
          return;
        }
        storePendingOAuth({
          code,
          accessToken,
          state,
          error: providerError || 'missing_code',
          errorDescription: reason,
          redirectUri: oauthRedirectUri(),
        });
        finish(backPath, { ok: false, reason, provider: googlePlatform ?? 'oauth' });
        return;
      }

      // Google (Gmail / Calendar): exchange the code right here so the flow
      // completes even when the card never remounts, then close / redirect.
      if (googlePlatform && code) {
        setMessage('שומר את חיבור Google...');
        try {
          const { data, error: fnError } = await withTimeout(
            supabase.functions.invoke('google-oauth-exchange', {
              body: { platform: googlePlatform, code, redirect_uri: redirectUri },
            }),
            EXCHANGE_TIMEOUT_MS,
            'החיבור ל-Google לא הושלם בזמן. נסה שוב.',
          );
          if (fnError) throw new Error(String(fnError.message ?? fnError));
          const payload = (data as any) ?? {};
          if (payload.error || payload.ok === false) throw new Error(String(payload.error || 'exchange_failed'));
          if (cancelled || exchangeDoneRef.current) return;
          exchangeDoneRef.current = true;
          const email = String(payload?.identity?.email ?? '');
          finish(
            `${CONNECTIONS_PATH}&google=connected${email ? `&google_account=${encodeURIComponent(email)}` : ''}`,
            { ok: true, name: email || null, provider: googlePlatform },
            () => {
              if (cancelled || exchangeDoneRef.current) return;
              setIsLoading(false);
              setSuccess(true);
              setMessage('החיבור הושלם בהצלחה.');
            },
          );
        } catch (e: any) {
          if (cancelled) return;
          const reason = String(e?.message ?? 'unknown');
          setIsLoading(false);
          setError({ title: 'החיבור ל-Google נכשל', detail: reason });
        }
        return;
      }

      // Personal-profile / other providers keep the stash-and-return contract:
      // their own card performs the exchange after the redirect.
      if (!isFacebook) {
        storePendingOAuth({ code, accessToken, state, error: null, errorDescription: null, redirectUri });
        finish(backPath, { ok: true, provider: state.split(':')[0] || 'oauth' });
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
        const payload = (data as any) ?? {};
        if (payload.error) {
          // Surface Facebook's own wording (message / code / fbtrace_id) instead
          // of a generic failure sentence.
          const d = payload.error_detail ?? {};
          const parts = [String(payload.error)];
          if (d.message && !String(payload.error).includes(String(d.message))) parts.push(String(d.message));
          if (d.code) parts.push(`code ${d.code}${d.subcode ? `/${d.subcode}` : ''}`);
          if (d.trace) parts.push(`trace ${d.trace}`);
          console.error('[oauth-callback] facebook exchange failed', payload);
          throw new Error(parts.join(' · '));
        }
        // Automatic page selection failed — hand off to the picker in the card
        // instead of aborting the connection (the user token is already saved).
        if (payload.needs_page_selection) {
          if (exchangeDoneRef.current) return;
          exchangeDoneRef.current = true;
          finish(`${CONNECTIONS_PATH}&fb=choose`, { ok: false, reason: 'needs_page_selection' });
          return;
        }
        const pageName = String((data as any)?.page?.name ?? '');
        if (cancelled || exchangeDoneRef.current) return;
        exchangeDoneRef.current = true;
        // Best-effort group import so the publishing targets list is populated.
        void supabase.functions.invoke('fb-groups-import', { body: {} }).catch(() => undefined);
        finish(
          `${CONNECTIONS_PATH}&fb=connected${pageName ? `&fb_page=${encodeURIComponent(pageName)}` : ''}`,
          { ok: true, name: pageName || null },
        );
      } catch (e: any) {
        if (cancelled) return;
        const reason = String(e?.message ?? 'unknown');
        setIsLoading(false);
        setError({ title: 'החיבור לפייסבוק נכשל', detail: reason });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const showFallback = !!error || hasTimedOut;

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="text-center space-y-4 max-w-md w-full">
        {isLoading && !showFallback && (
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        )}
        {showFallback && (
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
        )}
        {success && !showFallback && (
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            <span className="text-lg">✓</span>
          </div>
        )}
        <h1 className="text-lg font-semibold">
          {showFallback
            ? error?.title || 'החיבור אורך יותר מהצפוי'
            : success
              ? 'החיבור הושלם'
              : 'מסיים אימות...'}
        </h1>
        <p className="text-sm text-muted-foreground break-words">
          {showFallback
            ? error?.detail || 'הבקשה לא הושלמה תוך 4 שניות. ניתן לחזור למערכת ולנסות שוב.'
            : message}
        </p>
        {error?.detail && (
          <div
            dir="ltr"
            className="rounded-md bg-muted p-3 text-left text-xs font-mono break-all text-muted-foreground"
          >
            {error.detail}
          </div>
        )}
        {showFallback && (
          <Button onClick={returnToApp} className="mt-2">
            חזרה למערכת
          </Button>
        )}
      </div>
    </div>
  );
}

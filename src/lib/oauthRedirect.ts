/**
 * Shared OAuth redirect helpers.
 *
 * The Facebook / Meta redirect_uri is ALWAYS pinned to the production domain
 * (https://realtyz.co.il/oauth/callback). This guarantees the URI sent to Meta
 * matches the exact allowed URI configured in the Meta Developer Console and
 * bypasses rejections caused by temporary preview URLs or localhost.
 */
export const OAUTH_CALLBACK_PATH = '/oauth/callback';

/**
 * Origins that may appear as return targets after Meta lands on the canonical
 * production callback. These are validated when decoding the OAuth state so
 * the user is bounced back only to known Realtyz domains.
 */
const APPROVED_ORIGINS = [
  'https://realtyz.co.il',
  'https://www.realtyz.co.il',
  'https://realtyz.kalpiz.co.il',
  'https://realestate.omniai.co.il',
  'https://realtyzai.lovable.app',
  'http://localhost:8080',
];

const OAUTH_SESSION_HANDOFF_KEY = 'realtyz:oauth-session-handoff';

/** Persist the current app session before leaving for the canonical callback. */
export function storeOAuthSessionHandoff(accessToken: string, refreshToken: string): void {
  if (!accessToken || !refreshToken) return;
  try {
    localStorage.setItem(OAUTH_SESSION_HANDOFF_KEY, JSON.stringify({
      accessToken,
      refreshToken,
      at: Date.now(),
    }));
  } catch {
    /* storage can be unavailable in private browsing */
  }
}

/** Restore and consume the short-lived cross-domain OAuth session handoff. */
export function takeOAuthSessionHandoff(): { accessToken: string; refreshToken: string } | null {
  try {
    const raw = localStorage.getItem(OAUTH_SESSION_HANDOFF_KEY);
    if (!raw) return null;
    localStorage.removeItem(OAUTH_SESSION_HANDOFF_KEY);
    const parsed = JSON.parse(raw) as { accessToken?: string; refreshToken?: string; at?: number };
    if (!parsed.at || Date.now() - parsed.at > PENDING_TTL_MS) return null;
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
  } catch {
    return null;
  }
}

/**
 * The single production origin whose callback URI is whitelisted in Meta.
 * The redirect_uri sent to Meta is always this origin + /oauth/callback,
 * regardless of the origin the user is currently browsing from.
 */
const CANONICAL_OAUTH_ORIGIN = 'https://realtyz.co.il';

/** Canonicalize a callback URI once so start and exchange use identical bytes. */
export function normalizeOAuthRedirectUri(href: string): string {
  const url = new URL(href, window.location.origin);
  const origin = normalizeOrigin(url.href);
  return `${origin}${OAUTH_CALLBACK_PATH}`;
}

/** lowercase scheme+host, no trailing slash, no default port, no query/hash. */
function normalizeOrigin(href: string): string {
  const url = new URL(href);
  const scheme = url.protocol.toLowerCase();
  const host = url.hostname.toLowerCase();
  const port = url.port && url.port !== '80' && url.port !== '443' ? `:${url.port}` : '';
  return `${scheme}//${host}${port}`;
}

/** The live origin the user is actually browsing, normalised. */
export function currentOrigin(): string {
  return normalizeOrigin(window.location.href);
}

/**
 * The redirect URI to send to the provider.
 *
 * Always returns the canonical production callback URI. There are no browser,
 * environment, storage, or whitelist checks before Facebook receives it.
 */
export function oauthRedirectUri(): string {
  return `${CANONICAL_OAUTH_ORIGIN}${OAUTH_CALLBACK_PATH}`;
}

/** Whether the callback lands on the same origin the user is browsing. */
export function isSameOriginOAuthRedirect(): boolean {
  return normalizeOrigin(oauthRedirectUri()) === currentOrigin();
}

/** Origin to return to after Meta lands on the canonical callback domain. */
export function oauthReturnOrigin(): string {
  return currentOrigin();
}

/** Read the return origin embedded server-side in the OAuth state value. */
export function returnOriginFromOAuthState(state: string): string | null {
  const encoded = state.split(':').at(-1) ?? '';
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const value = decodeURIComponent(atob(base64));
    const origin = normalizeOrigin(value);
    const host = new URL(origin).hostname;
    const safe = APPROVED_ORIGINS.includes(origin) || host.endsWith('.lovable.app');
    return safe ? origin : null;
  } catch {
    return null;
  }
}

export type PendingOAuth = {
  code: string | null;
  /** Implicit user access token, when the provider returned one in the fragment. */
  accessToken?: string | null;

  state: string;
  error?: string | null;
  errorDescription?: string | null;
  redirectUri: string;
  at: number;
};

const PENDING_OAUTH_KEY = 'realtyz:pending-oauth';
const PENDING_TTL_MS = 5 * 60 * 1000;

/**
 * Fallback path for when the provider did NOT open in a popup (blocked popups,
 * in-app browsers): the callback stashes the result and the connection card
 * picks it up after the redirect back into the app.
 */
export function storePendingOAuth(p: Omit<PendingOAuth, 'at'>): void {
  try {
    localStorage.setItem(PENDING_OAUTH_KEY, JSON.stringify({ ...p, at: Date.now() }));
  } catch {
    /* storage disabled — popup path still works */
  }
}

/** Remove stale codes/errors before starting a fresh authorization session. */
export function clearPendingOAuth(): void {
  try {
    localStorage.removeItem(PENDING_OAUTH_KEY);
  } catch {
    /* storage disabled */
  }
}

/** Consume a stashed OAuth result whose state matches `statePrefix`. */
export function takePendingOAuth(statePrefix: string): PendingOAuth | null {
  try {
    const raw = localStorage.getItem(PENDING_OAUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingOAuth;
    if (!String(parsed?.state ?? '').startsWith(statePrefix)) return null;
    localStorage.removeItem(PENDING_OAUTH_KEY);
    if (!parsed.at || Date.now() - parsed.at > PENDING_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}


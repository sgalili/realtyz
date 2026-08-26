/**
 * Shared OAuth redirect helpers.
 *
 * Every provider popup lands on /oauth/callback of the CURRENTLY ACTIVE origin
 * (preview domain, custom domain or localhost) — never a hardcoded host — so
 * the redirect_uri sent to Meta always matches the domain the user is on.
 */
export const OAUTH_CALLBACK_PATH = '/oauth/callback';

/**
 * The redirect URI to send to the provider, built from the live origin.
 *
 * Normalised so it can be pasted 1:1 into Meta's "Valid OAuth Redirect URIs":
 * lowercase scheme+host, no trailing slash, no query/hash, no default port.
 */
export function oauthRedirectUri(): string {
  const url = new URL(window.location.href);
  const scheme = url.protocol.toLowerCase();
  const host = url.hostname.toLowerCase();
  const port = url.port && url.port !== '80' && url.port !== '443' ? `:${url.port}` : '';
  return `${scheme}//${host}${port}${OAUTH_CALLBACK_PATH}`;
}

/**
 * Log the exact URI handed to the provider so a "URL Blocked" error can be
 * matched character-for-character against the Meta Developer Console entry.
 */
export function logOAuthRedirectUri(provider: string): string {
  const uri = oauthRedirectUri();
  // eslint-disable-next-line no-console
  console.info(`[oauth:${provider}] redirect_uri =`, uri);
  return uri;
}

export type PendingOAuth = {
  code: string | null;
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

/**
 * Turn Meta's opaque "URL Blocked" refusal into an actionable Hebrew message
 * that names the exact URI that must be whitelisted in the Meta app.
 */
export function describeOAuthFailure(message?: string | null): string {
  const raw = String(message ?? '').trim();
  if (/blocked|redirect_uri|redirect uri|not allowed/i.test(raw)) {
    return `הכתובת ${oauthRedirectUri()} אינה מאושרת באפליקציית Meta. יש להוסיף אותה תחת Valid OAuth Redirect URIs, או להתחבר ידנית באמצעות טוקן.`;
  }
  return raw || 'החיבור לפייסבוק נכשל.';
}

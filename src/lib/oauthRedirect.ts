/**
 * Shared OAuth redirect helpers.
 *
 * Every provider popup lands on /oauth/callback of the CURRENTLY ACTIVE origin
 * (preview domain, custom domain or localhost) — never a hardcoded host — so
 * the redirect_uri sent to Meta always matches the domain the user is on.
 */
export const OAUTH_CALLBACK_PATH = '/oauth/callback';

/**
 * Redirect URIs that are whitelisted in the Meta Developer Console.
 *
 * Meta refuses any redirect_uri that is not listed there character-for-character
 * ("URL Blocked"), so when the app runs on an origin that Meta does not know
 * (ephemeral preview sandboxes, LAN IPs, in-app browsers) we fall back to the
 * canonical production origin instead of sending a URI that is certain to fail.
 */
const APPROVED_ORIGINS = [
  'https://realtyz.co.il',
  'https://www.realtyz.co.il',
  'https://realtyzai.lovable.app',
  'http://localhost:8080',
];

/** Canonical origin used when the live origin is not approved in Meta. */
const CANONICAL_ORIGIN = 'https://realtyz.co.il';

/** Optional hard override, e.g. VITE_OAUTH_REDIRECT_URI=https://app.example.com/oauth/callback */
function envOverride(): string | null {
  const env = (import.meta as any)?.env ?? {};
  const explicit = String(env.VITE_OAUTH_REDIRECT_URI ?? '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const origin = String(env.VITE_OAUTH_REDIRECT_ORIGIN ?? '').trim();
  if (origin) return `${normalizeOrigin(origin)}${OAUTH_CALLBACK_PATH}`;
  return null;
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

/** True when the live origin is whitelisted in the Meta app configuration. */
export function isApprovedOrigin(origin = currentOrigin()): boolean {
  return APPROVED_ORIGINS.includes(origin);
}

/**
 * The redirect URI to send to the provider.
 *
 * Order: explicit env override → the live origin when it is approved in Meta →
 * the canonical production origin. Always safe to paste 1:1 into Meta's
 * "Valid OAuth Redirect URIs".
 */
export function oauthRedirectUri(): string {
  const override = envOverride();
  if (override) return override;
  const origin = currentOrigin();
  return `${isApprovedOrigin(origin) ? origin : CANONICAL_ORIGIN}${OAUTH_CALLBACK_PATH}`;
}

/** Every URI that must exist in Meta's whitelist, for support messages. */
export function approvedRedirectUris(): string[] {
  return APPROVED_ORIGINS.map((o) => `${o}${OAUTH_CALLBACK_PATH}`);
}

/**
 * Log the exact URI handed to the provider so a "URL Blocked" error can be
 * matched character-for-character against the Meta Developer Console entry.
 */
export function logOAuthRedirectUri(provider: string): string {
  const uri = oauthRedirectUri();
  // eslint-disable-next-line no-console
  console.info(`[oauth:${provider}] redirect_uri =`, uri, '| live origin =', currentOrigin());
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
    return `הכתובת ${oauthRedirectUri()} אינה מאושרת באפליקציית Meta. יש להוסיף אותה תחת Valid OAuth Redirect URIs (מומלץ להוסיף את כל אלו: ${approvedRedirectUris().join(', ')}), או להתחבר ידנית באמצעות טוקן.`;
  }
  return raw || 'החיבור לפייסבוק נכשל.';
}

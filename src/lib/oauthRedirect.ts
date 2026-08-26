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
  'https://realtyzai.lovable.app',
  'http://localhost:8080',
];

/**
 * The single production origin whose callback URI is whitelisted in Meta.
 * The redirect_uri sent to Meta is always this origin + /oauth/callback,
 * regardless of the origin the user is currently browsing from.
 */
const CANONICAL_OAUTH_ORIGIN = 'https://realtyz.co.il';

/** Manual per-browser override, set from the connection card when Meta refuses a URI. */
const REDIRECT_OVERRIDE_KEY = 'realtyz:oauth-redirect-origin';

export function setOAuthRedirectOverride(origin: string | null): void {
  try {
    if (origin) localStorage.setItem(REDIRECT_OVERRIDE_KEY, normalizeOrigin(origin));
    else localStorage.removeItem(REDIRECT_OVERRIDE_KEY);
  } catch {
    /* storage disabled */
  }
}

export function oauthRedirectOverride(): string | null {
  try {
    const raw = localStorage.getItem(REDIRECT_OVERRIDE_KEY);
    return raw ? normalizeOrigin(raw) : null;
  } catch {
    return null;
  }
}

/** Optional hard override, e.g. VITE_OAUTH_REDIRECT_URI=https://app.example.com/oauth/callback */
function envOverride(): string | null {
  const env = (import.meta as any)?.env ?? {};
  const explicit = String(env.VITE_OAUTH_REDIRECT_URI ?? '').trim();
  if (explicit) return `${normalizeOrigin(explicit)}${OAUTH_CALLBACK_PATH}`;
  const origin = String(env.VITE_OAUTH_REDIRECT_ORIGIN ?? '').trim();
  if (origin) return `${normalizeOrigin(origin)}${OAUTH_CALLBACK_PATH}`;
  const manual = oauthRedirectOverride();
  if (manual) return `${manual}${OAUTH_CALLBACK_PATH}`;
  return null;
}

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

/** True when the live origin is whitelisted in the Meta app configuration. */
export function isApprovedOrigin(origin = currentOrigin()): boolean {
  return APPROVED_ORIGINS.includes(origin);
}

/**
 * The redirect URI to send to the provider.
 *
 * Always returns the canonical production callback URI so Meta receives the
 * exact whitelisted URL. Explicit env overrides are still honored for local
 * testing or emergency reconfiguration.
 */
export function oauthRedirectUri(): string {
  const override = envOverride();
  if (override) return normalizeOAuthRedirectUri(override);
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
    const safe = isApprovedOrigin(origin) || host.endsWith('.lovable.app');
    return safe ? origin : null;
  } catch {
    return null;
  }
}

/**
 * The redirect_uri is always the production domain, so no whitelist warning
 * is needed. This helper is kept for API compatibility.
 */
export function redirectWhitelistHint(): string | null {
  return null;
}

/** The canonical production URI that must exist in Meta's whitelist. */
export function approvedRedirectUris(): string[] {
  return [`${CANONICAL_OAUTH_ORIGIN}${OAUTH_CALLBACK_PATH}`];
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

/**
 * Narrow match for a genuine redirect-URI refusal from Meta.
 *
 * Deliberately strict: generic failures (timeouts, permission/scope errors,
 * "not allowed" from unrelated Graph calls) must NOT be reported as a blocked
 * callback URL, because the production URI is already whitelisted and the false
 * alert only confuses the operator.
 */
export function isRedirectUriFailure(message?: string | null): boolean {
  const raw = String(message ?? '');
  return (
    /url\s*blocked/i.test(raw) ||
    /redirect[_\s-]?uri/i.test(raw) ||
    /כתובת\s*ה?חזרה/i.test(raw) ||
    /url\s*חסומה/i.test(raw)
  );
}

/**
 * Turn Meta's opaque "URL Blocked" refusal into an actionable Hebrew message
 * that names the exact URI that must be whitelisted in the Meta app.
 */
export function describeOAuthFailure(message?: string | null): string {
  const raw = String(message ?? '').trim();
  if (isRedirectUriFailure(raw)) {
    return `הכתובת ${oauthRedirectUri()} אינה מאושרת באפליקציית Meta. יש להוסיף אותה תחת Valid OAuth Redirect URIs, או להתחבר ידנית באמצעות טוקן.`;
  }
  return raw || 'החיבור לפייסבוק נכשל.';
}


/**
 * Hebrew, copy-paste ready instructions naming the exact URI that must be
 * whitelisted in the Meta Developer Console.
 */
export function metaConsoleSetupSteps(): { title: string; uri: string; steps: string[]; allUris: string[] } {
  return {
    title: 'הוסף את כתובת החזרה הבאה באפליקציית Meta',
    uri: oauthRedirectUri(),
    allUris: approvedRedirectUris(),
    steps: [
      'היכנס ל‑developers.facebook.com ובחר את האפליקציה של Realtyz.',
      'פתח Facebook Login ← Settings.',
      'הדבק את הכתובת המדויקת בשדה Valid OAuth Redirect URIs (בלי לוכסן בסוף).',
      'שמור את השינויים (Save Changes) ונסה שוב להתחבר.',
    ],
  };
}

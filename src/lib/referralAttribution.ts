/**
 * Referral attribution: captures ?ref=CODE (or /ref/CODE) and keeps it for 30 days
 * in both localStorage and a cookie. The first captured code wins.
 */
const KEY = 'realtyz_ref_code';
const COOKIE = 'realtyz_ref';
const DAYS = 30;

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(name: string, value: string) {
  const exp = new Date(Date.now() + DAYS * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`;
}

export function normalizeRefCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length >= 4 && code.length <= 16 ? code : null;
}

/** Stored referral code, if any. */
export function getStoredRefCode(): string | null {
  try {
    return normalizeRefCode(localStorage.getItem(KEY) ?? readCookie(COOKIE));
  } catch {
    return null;
  }
}

/** Persist a code only if none is already locked in (first link wins). */
export function storeRefCode(raw: string | null | undefined): string | null {
  const code = normalizeRefCode(raw);
  if (!code) return getStoredRefCode();
  const existing = getStoredRefCode();
  if (existing) return existing;
  try {
    localStorage.setItem(KEY, code);
    writeCookie(COOKIE, code);
  } catch {
    /* storage blocked */
  }
  return code;
}

/** Reads ?ref= / ?referral= from the current URL and from /ref/:code paths. */
export function captureRefFromLocation(): string | null {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('ref') ?? url.searchParams.get('referral');
    const path = url.pathname.match(/^\/ref\/([^/?#]+)/i)?.[1] ?? null;
    return storeRefCode(q ?? path);
  } catch {
    return getStoredRefCode();
  }
}

export function clearRefCode() {
  try {
    localStorage.removeItem(KEY);
    writeCookie(COOKIE, '');
  } catch {
    /* noop */
  }
}

export function referralLink(code: string): string {
  return `https://realtyz.co.il/ref/${code}`;
}

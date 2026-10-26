/** Reject client-supplied login material; only GoLogin's server API supplies sessions. */
export function acceptsFacebookConnectionRequest(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const payload = body as Record<string, unknown>;
  if (payload.action === 'save') return false;
  const forbidden = /^(password|passwd|pass|pwd|email|username|login|credentials|cookies|session_cookies|access_token|token|secret)$/i;
  const hasCredentials = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(([key, nested]) => forbidden.test(key) || hasCredentials(nested));
  };
  return !hasCredentials(payload);
}
export const FOLLOWUP_DELAY_MS = 48 * 60 * 60 * 1000;

export function pendingFirstInvitation(row: { import_source: string | null; first_login_at: string | null; first_invitation_at: string | null }, lastSignIn: string | null) {
  return !!row.import_source && !row.first_login_at && !row.first_invitation_at && !lastSignIn;
}

export function followupDue(sentAt: string, now: number, clickedAt: string | null, firstLoginAt: string | null) {
  return !clickedAt && !firstLoginAt && now >= Date.parse(sentAt) + FOLLOWUP_DELAY_MS;
}

// PUBLIC_SITE_URL may be saved without a scheme (e.g. "realtyz.kalpiz.co.il"); never let that crash a send.
export function publicSiteOrigin(raw = Deno.env.get('PUBLIC_SITE_URL') ?? '') {
  const v = raw.trim();
  try { const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v || 'toraff.co.il'}`); return u.protocol === 'https:' && !/lovable\./.test(u.hostname) ? u.origin : 'https://toraff.co.il'; } catch { return 'https://toraff.co.il'; }
}

export function invitationLink(origin: string, userId: string, token: string) {
  const site = new URL(origin);
  if (site.protocol !== 'https:' || /lovable\./.test(site.hostname)) throw new Error('Invalid public site');
  return `${site.origin}/auth?broker=${encodeURIComponent(userId)}&invitation=${encodeURIComponent(token)}`;
}
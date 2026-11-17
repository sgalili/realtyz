export const FOLLOWUP_DELAY_MS = 48 * 60 * 60 * 1000;

export function pendingFirstInvitation(row: { import_source: string | null; first_login_at: string | null; first_invitation_at: string | null }, lastSignIn: string | null) {
  return !!row.import_source && !row.first_login_at && !row.first_invitation_at && !lastSignIn;
}

export function followupDue(sentAt: string, now: number, clickedAt: string | null, firstLoginAt: string | null) {
  return !clickedAt && !firstLoginAt && now >= Date.parse(sentAt) + FOLLOWUP_DELAY_MS;
}

export function invitationLink(origin: string, userId: string, token: string) {
  const site = new URL(origin);
  if (site.protocol !== 'https:' || /lovable\./.test(site.hostname)) throw new Error('Invalid public site');
  return `${site.origin}/auth?broker=${encodeURIComponent(userId)}&invitation=${encodeURIComponent(token)}`;
}
export function campaignEmailRoute(choice: unknown, resendReady: boolean, gmailCount: number, preferResend: boolean): 'alias'|'gmail'|'unavailable' {
  if (choice === 'alias') return resendReady ? 'alias' : 'unavailable';
  if (choice === 'gmail') return gmailCount > 0 ? 'gmail' : 'unavailable';
  return resendReady && (preferResend || gmailCount === 0) ? 'alias' : gmailCount > 0 ? 'gmail' : 'unavailable';
}
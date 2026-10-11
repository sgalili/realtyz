const key = (userId: string) => `realtyz-partner-intro-dismissed-${userId}`;
const completed = new Set<string>();
export function partnerIntroDismissed(userId: string) {
  try { return localStorage.getItem(key(userId)) === 'true'; } catch { return false; }
}
export function completePartnerIntro(userId: string, dontShow: boolean) {
  if (dontShow) { try { localStorage.setItem(key(userId), 'true'); } catch { /* Storage unavailable: show again safely. */ } }
  completed.add(userId);
}
export function consumePartnerIntroCompletion(userId: string) {
  return completed.delete(userId);
}
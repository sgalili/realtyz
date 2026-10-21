const DISMISSED_KEY = 'toraf-welcome-slides-dismissed-v2';
export const WELCOME_REOPEN_EVENT = 'toraf-welcome-reopen';

export function shouldShowWelcome(source: 'home' | 'logo' | 'instructions' = 'home') {
  return source === 'instructions' || !welcomeDismissed();
}

export function welcomeDismissed() {
  try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; }
}

export function dismissWelcome() {
  try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* Keep showing when storage is unavailable. */ }
}
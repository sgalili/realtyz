export const DEMO_UPGRADE_EVENT = 'realtyz-demo-upgrade-requested';
export const DEMO_AUTH_REQUIRED_EVENT = 'realtyz-demo-auth-required';
export const DEMO_EXIT_PENDING_KEY = 'realtyz-demo-exit-pending';

export function requestDemoUpgrade(reason?: string) {
  window.dispatchEvent(new CustomEvent(DEMO_UPGRADE_EVENT, { detail: { reason } }));
}

export function requestDemoAuth() {
  window.localStorage.setItem(DEMO_EXIT_PENDING_KEY, 'true');
  window.dispatchEvent(new Event(DEMO_AUTH_REQUIRED_EVENT));
}
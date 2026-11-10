import { showInventoryComingSoon } from '@/lib/inventoryCollection';
export const FACEBOOK_CONNECTION_OPEN = 'toraff:facebook-connect';
export function openFacebookConnection() {
  if (showInventoryComingSoon('facebook')) return;
  window.dispatchEvent(new Event(FACEBOOK_CONNECTION_OPEN));
}
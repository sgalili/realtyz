export const FACEBOOK_CONNECTION_OPEN = 'toraff:facebook-connect';
export function openFacebookConnection() {
  window.dispatchEvent(new Event(FACEBOOK_CONNECTION_OPEN));
}
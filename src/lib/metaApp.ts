/**
 * Meta (Facebook) app identity used by every Facebook login trigger.
 *
 * Pinned to the single Meta Developer app where the production callback
 * `https://realtyz.co.il/oauth/callback` is registered under Valid OAuth
 * Redirect URIs. The App ID is public (it appears in every login URL), so it is
 * safe to keep in client code — the App Secret stays server-side only.
 *
 * The backend pins the same value in `supabase/functions/_shared/fbPersonal.ts`
 * (`CANONICAL_FB_APP_ID`); keep both in sync if the app ever changes.
 */
export const META_APP_ID = '2885631568443536';

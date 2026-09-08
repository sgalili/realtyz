import { supabase } from '@/integrations/supabase/client';

/** Session flag set right after a Google sign-in on a brand-new signup. */
export const GOOGLE_SERVICES_PENDING_KEY = 'realtyz-google-services-pending';
/** Local flag so the first-time approval popup never appears twice. */
export const FIRST_TIME_SYNC_KEY = 'realtyz-first-time-sync-done';

/**
 * Minimum scopes for the combined flow: send mail, manage calendar events,
 * read the YouTube channel. Nothing broader — extra scopes only inflate
 * Google's consent warning without unlocking a feature we actually call.
 */
const GOOGLE_ALL_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

/**
 * Build the combined Gmail + Calendar + YouTube consent URL.
 * Returns null when the platform Google client id is not configured.
 */
export async function buildGoogleAllAuthUrl(): Promise<string | null> {
  const { data: cfg, error } = await supabase.functions.invoke('google-oauth-config', { body: {} });
  const clientId = String((cfg as any)?.client_id ?? '');
  if (error || !clientId) return null;
  const returnToken = btoa(encodeURIComponent(window.location.origin))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}/oauth/callback`,
    response_type: 'code',
    scope: GOOGLE_ALL_SCOPES,
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    state: `google_all:${returnToken}`,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Which of the three Google services are already live for this user. */
export async function connectedGoogleServices(): Promise<Set<string>> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return new Set<string>();
  const { data } = await supabase
    .from('social_connections')
    .select('platform, is_connected')
    .eq('created_by', userId)
    .in('platform', ['gmail', 'google_calendar', 'youtube']);
  return new Set((data ?? []).filter((r: any) => r.is_connected).map((r: any) => String(r.platform)));
}

/**
 * True when this workspace already has a live Facebook link (a Page binding or
 * a personal connection). Used to hide every "connect Facebook" prompt.
 */
export async function isFacebookConnected(): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return false;
  const [page, personal, social] = await Promise.all([
    supabase.from('messenger_page_bindings').select('page_id').eq('owner_id', userId).limit(1),
    supabase.from('fb_personal_connections').select('workspace_owner_id').eq('workspace_owner_id', userId).limit(1),
    supabase
      .from('social_connections')
      .select('platform, is_connected')
      .eq('created_by', userId)
      .in('platform', ['facebook', 'facebook_page', 'instagram', 'meta'])
      .limit(5),
  ]);
  if ((page.data ?? []).length > 0) return true;
  if ((personal.data ?? []).length > 0) return true;
  return (social.data ?? []).some((r: any) => r.is_connected);
}

export function readFlag(store: Storage | undefined, key: string): string | null {
  try { return store?.getItem(key) ?? null; } catch { return null; }
}

export function clearFlag(store: Storage | undefined, key: string): void {
  try { store?.removeItem(key); } catch { /* storage disabled */ }
}

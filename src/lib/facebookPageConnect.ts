/**
 * Single source of truth for starting / driving the Facebook Page connection.
 *
 * EVERY entry point (Connections tab card, /campaigns error banner, onboarding
 * dialogs) must go through here so the exact same edge function, the exact same
 * OAuth scopes and the exact same database upsert run in all cases. Duplicating
 * the invoke call per screen is what previously let one place connect the page
 * while another still showed "disconnected".
 */
import { supabase } from '@/integrations/supabase/client';
import { oauthRedirectUri, oauthReturnOrigin } from '@/lib/oauthRedirect';

/** Provider key used by the OAuth popup bridge for page-binding logins. */
export const FACEBOOK_PAGE_PROVIDER = 'facebook_page';

export function describeMetaConnectError(payload: any): string {
  const parts = [payload?.error, payload?.fb_message, payload?.error_detail?.details, payload?.error_detail?.hint]
    .filter((p) => typeof p === 'string' && p.trim().length > 0);
  return Array.from(new Set(parts)).join(' — ');
}

/** Error that keeps the JSON body so callers can react to flags like retry_basic. */
export class MetaPageConnectError extends Error {
  payload: any;
  constructor(message: string, payload: any) {
    super(message);
    this.payload = payload ?? null;
  }
}

/** Calls the meta-page-connect edge function and unwraps its JSON error body. */
export async function callMetaPageConnect<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('meta-page-connect', { body });
  if (error) {
    // Non-2xx responses hide the JSON body behind error.context — read it so the
    // user sees the real reason instead of "non-2xx status code".
    let detailed = '';
    let payload: any = null;
    try {
      const ctx: any = (error as any)?.context;
      payload = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
      detailed = describeMetaConnectError(payload);
    } catch {
      detailed = '';
    }
    const raw = detailed || String(error?.message ?? error);
    throw new MetaPageConnectError(
      /failed to (send|fetch)/i.test(raw) ? 'לא ניתן להגיע לשירות החיבור לפייסבוק. נסה שוב בעוד רגע.' : raw,
      payload,
    );
  }
  if (data && (data as any).error) {
    throw new MetaPageConnectError(describeMetaConnectError(data) || String((data as any).error), data);
  }
  return data as T;
}

/**
 * Starts the Facebook Page login and returns the Meta authorization URL.
 * The callback page then exchanges the code through the very same function,
 * which upserts the Page ID + Page Access Token for the active workspace.
 */
export async function startMetaPageConnect(opts: { scopeTier?: 'full' | 'basic' } = {}): Promise<string> {
  const res = await callMetaPageConnect<{ auth_url?: string }>({
    action: 'start',
    scope_tier: opts.scopeTier ?? 'full',
    redirect_uri: oauthRedirectUri(),
    return_origin: oauthReturnOrigin(),
  });
  const url = res?.auth_url;
  if (!url) throw new Error('לא הוחזרה כתובת אימות מפייסבוק');
  return String(url);
}

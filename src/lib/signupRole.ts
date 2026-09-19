// Registration role: a Realtyz account is either a broker (מתווך) who gets the
// full office workspace, or a partner (שותף) who only gets the partner portal.
// Buyers / sellers / renters / landlords are CRM contact types, never account
// roles, so they are deliberately absent here.
import { supabase } from '@/integrations/supabase/client';
import { PUBLIC_LISTING_RESUME_KEY } from '@/lib/publicListingDraft';

export type SignupRole = 'broker' | 'partner' | 'property_owner' | 'property_seeker';

const KEY = 'realtyz-signup-role';

export const SIGNUP_ROLE_LABELS: Record<SignupRole, string> = {
  broker: 'מתווך',
  partner: 'שותף',
  property_owner: 'מפרסם נכס',
  property_seeker: 'מחפש נכס',
};

export function setPendingSignupRole(role: SignupRole) {
  try {
    window.localStorage.setItem(KEY, role);
  } catch {
    /* storage disabled */
  }
}

export function readPendingSignupRole(): SignupRole | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'broker' || v === 'partner' || v === 'property_owner' || v === 'property_seeker' ? v : null;
  } catch {
    return null;
  }
}

export function clearPendingSignupRole() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* storage disabled */
  }
}

/**
 * Applies the role picked at registration to the freshly signed-in account.
 * Idempotent: both RPCs only add a role when the account has none yet.
 * Returns the path the user should land on, or null when nothing was pending.
 */
export async function applyPendingSignupRole(): Promise<string | null> {
  const role = readPendingSignupRole();
  if (!role) return null;
  if (role === 'partner') {
    const { data, error } = await supabase.rpc('register_as_affiliate', { _display_name: null, _phone: null });
    if (error || !(data as { ok?: boolean } | null)?.ok) return null;
    clearPendingSignupRole();
    return '/affiliate';
  }
  if (role === 'property_owner') {
    const { data, error } = await supabase.rpc('register_as_property_owner', { _display_name: null });
    if (error || !(data as { ok?: boolean } | null)?.ok) return null;
    clearPendingSignupRole();
    try {
      if (window.localStorage.getItem(PUBLIC_LISTING_RESUME_KEY) === '1') return '/public-listings';
    } catch { /* storage disabled */ }
    return '/owner/properties';
  }
  if (role === 'property_seeker') {
    const { data, error } = await supabase.rpc('register_as_property_seeker', { _display_name: null });
    if (error || !(data as { ok?: boolean } | null)?.ok) return null;
    clearPendingSignupRole();
    return '/public-listings';
  }
  const { data, error } = await supabase.rpc('register_as_broker', { _display_name: null });
  if (error || !(data as { ok?: boolean } | null)?.ok) return null;
  clearPendingSignupRole();
  return '/dashboard';
}

// Registration role: a Realtyz account is either a broker (מתווך) who gets the
// full office workspace, or a partner (שותף) who only gets the partner portal.
// Buyers / sellers / renters / landlords are CRM contact types, never account
// roles, so they are deliberately absent here.
import { supabase } from '@/integrations/supabase/client';
import { PUBLIC_LISTING_RESUME_KEY } from '@/lib/publicListingDraft';

export type SignupRole = 'broker' | 'partner' | 'property_owner' | 'property_seeker' | 'developer' | 'contractor';

const KEY = 'realtyz-signup-role';
/** Developers land straight on the Yad2 import step after verification. */
export const DEVELOPER_ONBOARDING_PATH = '/developer-dashboard?onboarding=1';

export const SIGNUP_ROLE_LABELS: Record<SignupRole, string> = {
  broker: 'מתווך',
  partner: 'שותף',
  property_owner: 'בעל הנכס',
  property_seeker: 'קונה פרטי',
  developer: 'יזם',
  contractor: 'קבלן',
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
    return v === 'broker' || v === 'partner' || v === 'property_owner' || v === 'property_seeker' || v === 'developer' || v === 'contractor' ? v : null;
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: savedRoles, error: rolesError } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
  if (rolesError) return null;
  if (savedRoles?.some(r => !['user', 'affiliate'].includes(r.role))) {
    clearPendingSignupRole();
    return null;
  }
  if (role === 'partner') {
    const { data, error } = await supabase.rpc('register_as_affiliate', { _display_name: null, _phone: null });
    if (error || !(data as { ok?: boolean } | null)?.ok) return null;
    clearPendingSignupRole();
    return '/affiliate';
  }
  const { data, error } = await supabase.rpc('select_signup_user_type', { _type: role });
  if (error || !(data as { ok?: boolean } | null)?.ok) return null;
  clearPendingSignupRole();
  if (role === 'developer' || role === 'contractor') return DEVELOPER_ONBOARDING_PATH;
  if (role === 'property_seeker') return '/public-listings';
  if (role === 'property_owner') {
    try { if (window.localStorage.getItem(PUBLIC_LISTING_RESUME_KEY) === '1') return '/public-listings'; } catch { /* storage disabled */ }
    return '/owner/properties';
  }
  return '/dashboard';
}

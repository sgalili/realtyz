// Pending choices are signup intentions only; the authenticated RPC owns grants.
import { supabase } from '@/integrations/supabase/client';
import { PUBLIC_LISTING_RESUME_KEY } from '@/lib/publicListingDraft';
import { readPendingBrokerLicense, savePendingBrokerLicense, verifyBrokerLicense } from '@/lib/brokerLicense';

export type SignupRole = 'broker' | 'partner' | 'property_owner' | 'property_seeker' | 'developer' | 'contractor';

const KEY = 'realtyz-signup-role';
/** Developers land straight on the Yad2 import step after verification. */
export const DEVELOPER_ONBOARDING_PATH = '/developer-dashboard?onboarding=1';

export const SIGNUP_ROLE_LABELS: Record<SignupRole, string> = {
  broker: 'מתווך/סוכנות',
  partner: 'תכנית שותפים',
  property_owner: 'משכיר/שוכר',
  property_seeker: 'קונה/מוכר',
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
  savePendingBrokerLicense('');
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* storage disabled */
  }
}

const WELCOME_KEY = 'toraff-post-signup-welcome';
/** Display-only flag: shows the one-time welcome/trust prompt after signup. */
export function markPostSignupWelcome(role: SignupRole) {
  try { window.localStorage.setItem(WELCOME_KEY, role); } catch { /* storage disabled */ }
}
export function readPostSignupWelcome(): SignupRole | null {
  try {
    const v = window.localStorage.getItem(WELCOME_KEY);
    return v && v in SIGNUP_ROLE_LABELS ? (v as SignupRole) : null;
  } catch { return null; }
}
export function clearPostSignupWelcome() {
  try { window.localStorage.removeItem(WELCOME_KEY); } catch { /* storage disabled */ }
}

/**
 * Applies the role picked at registration to the freshly signed-in account.
 * The server validates primary identity and existing roles atomically.
 * Returns the path the user should land on, or null when nothing was pending.
 */
export async function applyPendingSignupRole(): Promise<string | null> {
  const role = readPendingSignupRole();
  if (!role) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  markPostSignupWelcome(role);
  const { data: savedRoles, error: rolesError } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
  if (rolesError) return null;
  if (savedRoles?.some(r => !['user', 'affiliate'].includes(r.role))) {
    clearPendingSignupRole();
    return null;
  }
  if (role === 'partner') {
    clearPendingSignupRole();
    return null;
  }
  if (role === 'broker') {
    try { await verifyBrokerLicense(readPendingBrokerLicense(), 'verify'); }
    catch { return null; } // Keep the account unprivileged and require role/license completion.
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

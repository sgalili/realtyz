// Pending choices are signup intentions only; the authenticated RPC owns grants.
import { supabase } from '@/integrations/supabase/client';
import { readPendingBrokerLicense, savePendingBrokerLicense, verifyBrokerLicense } from '@/lib/brokerLicense';
import { clearSmsSignup, readSmsSignup, signupRpc } from '@/lib/smsSignup';

export type SignupRole = 'broker' | 'partner' | 'property_owner' | 'property_seeker' | 'developer' | 'contractor';

const KEY = 'realtyz-signup-role';
const NAME_KEY = 'toraff-signup-full-name';
export function setPendingSignupName(name: string) {
  try { window.localStorage.setItem(NAME_KEY, name.trim()); } catch { /* signup intent only */ }
}
/** Explicit project onboarding shortcut, never an automatic sign-in destination. */
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
    window.localStorage.removeItem(NAME_KEY);
  } catch {
    /* storage disabled */
  }
}

const WELCOME_KEY = 'toraff-post-signup-welcome';
export const POST_SIGNUP_WELCOME_EVENT = 'toraff:post-signup-welcome';
/** Display-only flag: shows the one-time welcome/trust prompt after signup. */
export function markPostSignupWelcome(role: SignupRole) {
  try { window.localStorage.setItem(WELCOME_KEY, role); } catch { /* storage disabled */ }
  window.dispatchEvent(new CustomEvent(POST_SIGNUP_WELCOME_EVENT, { detail: role }));
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
  const sms = readSmsSignup();
  if (sms) {
    try {
      await signupRpc('complete_sms_signup', { _first_name: sms.firstName, _last_name: sms.lastName, _gender: sms.gender, _phone: sms.phone });
      clearSmsSignup();
    } catch { /* Keep pending profile for authenticated completion to retry. */ }
  }
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
  const name = window.localStorage.getItem(NAME_KEY)?.trim();
  if (name) {
    const { data, error } = await supabase.rpc('complete_signup_profile', { _full_name: name });
    if (error || !(data as { ok?: boolean } | null)?.ok) return null;
  }
  if (role === 'broker') {
    try { await verifyBrokerLicense(readPendingBrokerLicense(), 'verify'); }
    catch { return null; } // Keep the account unprivileged and require role/license completion.
  }
  const { data, error } = await supabase.rpc('select_signup_user_type', { _type: role });
  if (error || !(data as { ok?: boolean } | null)?.ok) return null;
  markPostSignupWelcome(role);
  clearPendingSignupRole();
  return '/';
}

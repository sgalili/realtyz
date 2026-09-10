// Registration role: a Realtyz account is either a broker (מתווך) who gets the
// full office workspace, or a partner (שותף) who only gets the partner portal.
// Buyers / sellers / renters / landlords are CRM contact types, never account
// roles, so they are deliberately absent here.
import { supabase } from '@/integrations/supabase/client';

export type SignupRole = 'broker' | 'partner';

const KEY = 'realtyz-signup-role';

export const SIGNUP_ROLE_LABELS: Record<SignupRole, string> = {
  broker: 'מתווך',
  partner: 'שותף',
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
    return v === 'broker' || v === 'partner' ? v : null;
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
  clearPendingSignupRole();
  try {
    if (role === 'partner') {
      await supabase.rpc('register_as_affiliate', { _display_name: null, _phone: null });
      return '/affiliate';
    }
    await supabase.rpc('register_as_broker', { _display_name: null });
    return '/';
  } catch {
    return null;
  }
}

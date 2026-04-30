import { supabase } from '@/integrations/supabase/client';

/**
 * Records a real user's intent to upgrade beyond their current plan target.
 * - Inserts a row in `admin_leads` (RLS allows users to insert their own).
 * - Realtime is enabled on this table so the Super Admin sidebar reacts instantly.
 *
 * Errors are swallowed (logged only) so the UX flow is never blocked by lead
 * capture issues.
 */
export interface LogUpgradeInterestArgs {
  userId: string;
  userEmail?: string | null;
  currentTarget: number;
  attemptedTarget: number;
  electionType?: 'national' | 'primaries' | string | null;
  source?: string;
}

export async function logUpgradeInterest({
  userId,
  userEmail,
  currentTarget,
  attemptedTarget,
  electionType,
  source = 'strategic_growth_slider',
}: LogUpgradeInterestArgs): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!userId) return { ok: false, error: 'missing user' };
  if (attemptedTarget <= currentTarget) {
    return { ok: false, error: 'no upsell delta' };
  }

  const { data, error } = await supabase
    .from('admin_leads')
    .insert({
      user_id: userId,
      user_email: userEmail ?? null,
      lead_type: 'upgrade_interest',
      current_target: currentTarget,
      attempted_target: attemptedTarget,
      election_type: electionType ?? null,
      status: 'new',
      metadata: {
        source,
        delta: attemptedTarget - currentTarget,
        captured_at: new Date().toISOString(),
        path: typeof window !== 'undefined' ? window.location.pathname : null,
      },
    })
    .select('id')
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[logUpgradeInterest] failed to record lead', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id };
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const TRIAL_RECORD_CAP = 100;
export const TRIAL_DAYS = 7;

export type PlanStatus = 'trial' | 'active' | 'expired' | string;

export interface TrialStatus {
  planStatus: PlanStatus;
  trialStartDate: Date | null;
  isTrial: boolean;
  isTrialActive: boolean;
  isTrialExpired: boolean;
  daysRemaining: number;
  loading: boolean;
}

export function useTrialStatus(): TrialStatus {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['trial-status', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('plan_status, trial_start_date')
        .eq('id', user!.id)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });

  // Treat unknown / null / 'new' plan as trial so brand-new users get the wizard.
  const rawStatus = data?.plan_status as PlanStatus | null | undefined;
  const normalized: PlanStatus = (() => {
    if (!rawStatus) return 'trial';
    const lc = String(rawStatus).toLowerCase();
    if (lc === 'new' || lc === 'trial') return 'trial';
    return rawStatus;
  })();
  const planStatus = normalized;
  const trialStartDate = data?.trial_start_date ? new Date(data.trial_start_date) : null;

  let daysRemaining = 0;
  if (trialStartDate) {
    const elapsedMs = Date.now() - trialStartDate.getTime();
    const remainingMs = TRIAL_DAYS * 24 * 60 * 60 * 1000 - elapsedMs;
    daysRemaining = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  } else if (planStatus === 'trial') {
    // No trial_start_date yet - assume full window remaining for new users
    daysRemaining = TRIAL_DAYS;
  }

  const isTrial = planStatus === 'trial';
  const isTrialActive = isTrial && daysRemaining > 0;
  const isTrialExpired = isTrial && daysRemaining <= 0;

  return {
    planStatus,
    trialStartDate,
    isTrial,
    isTrialActive,
    isTrialExpired,
    daysRemaining,
    loading: isLoading,
  };
}

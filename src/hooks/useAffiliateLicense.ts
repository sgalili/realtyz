// Partner compliance layer.
//
// Levels 1 & 2 are digital-marketing / lead-generation fees and are open to
// every partner. Level 4 (deal-closing commission) is restricted by the Real
// Estate Brokerage Law to holders of a verified broker license, so the portal
// reads the license status from `affiliate_profiles` and gates it here.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type LicenseStatus = 'none' | 'pending' | 'verified' | 'rejected';

/** Version string stored with the partner's terms consent. */
export const AFFILIATE_TERMS_VERSION = 'affiliate-marketing-2026-09';

export type AffiliateLicense = {
  status: LicenseStatus;
  licenseNumber: string;
  holderName: string;
  submittedAt: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  termsAcceptedAt: string | null;
  termsVersion: string | null;
};

export const LICENSE_STATUS_LABELS: Record<LicenseStatus, string> = {
  none: 'לא הוגש רישיון',
  pending: 'רישיון בבדיקה',
  verified: 'מתווך מאומת',
  rejected: 'הרישיון נדחה',
};

const EMPTY: AffiliateLicense = {
  status: 'none',
  licenseNumber: '',
  holderName: '',
  submittedAt: null,
  verifiedAt: null,
  rejectionReason: null,
  termsAcceptedAt: null,
  termsVersion: null,
};

export function useAffiliateLicense() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['affiliate-license', user?.id] as const;

  const query = useQuery({
    queryKey,
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<AffiliateLicense> => {
      const { data, error } = await supabase
        .from('affiliate_profiles')
        .select('license_number, license_holder_name, license_status, license_submitted_at, license_verified_at, license_rejection_reason, terms_accepted_at, terms_version')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      const row = (data ?? null) as Record<string, unknown> | null;
      if (!row) return EMPTY;
      const status = String(row.license_status ?? 'none');
      return {
        status: (['none', 'pending', 'verified', 'rejected'].includes(status) ? status : 'none') as LicenseStatus,
        licenseNumber: String(row.license_number ?? ''),
        holderName: String(row.license_holder_name ?? ''),
        submittedAt: (row.license_submitted_at as string | null) ?? null,
        verifiedAt: (row.license_verified_at as string | null) ?? null,
        rejectionReason: (row.license_rejection_reason as string | null) ?? null,
        termsAcceptedAt: (row.terms_accepted_at as string | null) ?? null,
        termsVersion: (row.terms_version as string | null) ?? null,
      };
    },
  });

  const submit = useMutation({
    mutationFn: async (input: { licenseNumber: string; holderName?: string }) => {
      const { data, error } = await supabase.rpc('submit_affiliate_license', {
        _license_number: input.licenseNumber,
        _holder_name: input.holderName ?? null,
      });
      if (error) throw error;
      const result = (data ?? null) as { ok?: boolean; error?: string } | null;
      if (!result?.ok) throw new Error(result?.error || 'submit_failed');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const acceptTerms = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('accept_affiliate_terms', { _version: AFFILIATE_TERMS_VERSION });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const license = query.data ?? EMPTY;

  return {
    license,
    isLoading: query.isLoading,
    /** True only for a verified broker license — the gate for level 4 rewards. */
    level4Unlocked: license.status === 'verified',
    submit: submit.mutateAsync,
    isSubmitting: submit.isPending,
    acceptTerms: acceptTerms.mutateAsync,
    isAcceptingTerms: acceptTerms.isPending,
  };
}

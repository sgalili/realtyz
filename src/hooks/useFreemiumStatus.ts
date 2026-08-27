import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface FreemiumStatus {
  daysLeft: number;
  contactsUsed: number;
  contactsCap: number;
  propertiesUsed: number;
  propertiesCap: number;
  walletILS: number;
  walletAgorot: number;
  isTrial: boolean;
  isBlocked: boolean;
  blockReason: 'time' | 'contacts' | null;
  loading: boolean;
}

import { FREE_CONTACTS, FREE_PROPERTIES } from '@/lib/pricing';

const CONTACT_CAP = FREE_CONTACTS;
const PROPERTY_CAP = FREE_PROPERTIES;

/**
 * Realtyz freemium guardrails: 30-day trial · 100 contacts max · ₪50 starting wallet.
 * Returns live status used by CRM/Broadcast/Autopilot to gate writes.
 */
export function useFreemiumStatus(): FreemiumStatus {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['freemium-status', user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [{ data: profile }, { count }, { count: propCount }] = await Promise.all([
        supabase
          .from('profiles')
          .select('plan_status, trial_start_date, trial_end_date, wallet_balance_agorot')
          .eq('id', user!.id)
          .maybeSingle(),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('is_demo', false),
        supabase
          .from('listings')
          .select('id', { count: 'exact', head: true }),
      ]);
      return { profile, contactsUsed: count ?? 0, propertiesUsed: propCount ?? 0 };
    },
  });

  const profile: any = data?.profile ?? null;
  const contactsUsed = data?.contactsUsed ?? 0;
  const propertiesUsed = data?.propertiesUsed ?? 0;
  const walletAgorot = profile?.wallet_balance_agorot ?? 5000;
  const walletILS = walletAgorot / 100;
  const isTrial = (profile?.plan_status ?? 'trial') === 'trial';

  const endDate: Date | null = profile?.trial_end_date
    ? new Date(profile.trial_end_date)
    : profile?.trial_start_date
      ? new Date(new Date(profile.trial_start_date).getTime() + 30 * 24 * 60 * 60 * 1000)
      : null;

  const daysLeft = endDate
    ? Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : 30;

  // Freemium is eternal: no time block, only volume caps.
  let blockReason: FreemiumStatus['blockReason'] = null;
  if (isTrial && contactsUsed >= CONTACT_CAP) blockReason = 'contacts';

  return {
    daysLeft,
    contactsUsed,
    contactsCap: CONTACT_CAP,
    propertiesUsed,
    propertiesCap: PROPERTY_CAP,
    walletILS,
    walletAgorot,
    isTrial,
    isBlocked: blockReason !== null,
    blockReason,
    loading: isLoading,
  };
}

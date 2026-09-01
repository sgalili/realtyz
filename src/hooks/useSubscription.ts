import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type PlanName = 'free' | 'agent' | 'pro' | 'max';

export interface SubscriptionStatus {
  plan: PlanName;
  plan_display_name: string;
  monthly_price_ils: number;
  effective_price_ils: number;
  contact_limit: number;
  contacts_used: number;
  status: 'active' | 'canceled' | 'past_due';
  is_launch_promo: boolean;
  current_period_end: string | null;
  wallet_balance_ils: number;
  promo_claimed: number;
  promo_slots: number;
  promo_remaining: number;
}

const db = supabase as any;

export function useSubscription() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<SubscriptionStatus | null>({
    queryKey: ['subscription-status', user?.id],
    enabled: !!user?.id,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('get_my_subscription_status');
      if (error) throw error;
      return (data ?? null) as SubscriptionStatus | null;
    },
  });

  const subscribe = useMutation({
    mutationFn: async (plan: PlanName) => {
      const { data, error } = await db.rpc('subscribe_to_plan', { _plan_name: plan });
      if (error) throw error;
      return data as { ok: boolean; is_launch_promo: boolean; effective_price_ils: number; plan: string };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['subscription-status'] });
      qc.invalidateQueries({ queryKey: ['credit-wallet'] });
      qc.invalidateQueries({ queryKey: ['freemium-status'] });
      if (res?.is_launch_promo) {
        toast.success('נכנסת למבצע ההשקה: 50% הנחה + 15 ₪ מתנה לארנק');
      } else {
        toast.success('החבילה עודכנה');
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc('cancel_my_subscription');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscription-status'] });
      toast.success('המנוי בוטל');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { status: query.data ?? null, loading: query.isLoading, subscribe, cancel };
}

export interface WalletTransaction {
  id: string;
  amount_ils: number;
  type: 'launch_bonus' | 'referral_reward' | 'manual_adjustment' | 'usage_deduction' | 'topup';
  note: string | null;
  created_at: string;
}

export function useCreditWallet() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['credit-wallet', user?.id],
    enabled: !!user?.id,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // Surface backend errors instead of silently rendering ₪0.
      const [walletRes, txnRes] = await Promise.all([
        db.rpc('get_my_wallet'),
        db
          .from('credit_transactions')
          .select('id, amount_ils, type, note, created_at')
          .order('created_at', { ascending: false })
          .limit(30),
      ]);
      if (walletRes.error) throw walletRes.error;
      if (txnRes.error) throw txnRes.error;
      return {
        balance: Number(walletRes.data?.balance_ils ?? 0),
        transactions: (txnRes.data ?? []) as WalletTransaction[],
      };
    },
  });
}


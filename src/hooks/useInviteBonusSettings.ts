import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type InviteBonusSettings = { referrer_credits: number; friend_credits: number };
export const INVITE_BONUS_DEFAULTS: InviteBonusSettings = { referrer_credits: 200, friend_credits: 100 };

export function useInviteBonusSettings() {
  return useQuery({ queryKey: ['invite-bonus-settings'], queryFn: async (): Promise<InviteBonusSettings> => {
    const { data, error } = await supabase.rpc('get_invite_bonus_settings');
    if (error) throw error;
    const d = (data ?? {}) as Partial<InviteBonusSettings>;
    return { referrer_credits: Number(d.referrer_credits ?? 200), friend_credits: Number(d.friend_credits ?? 100) };
  } });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';

const db = supabase as any;

export interface ReferralRow {
  id: string;
  status: 'registered_free' | 'converted_paid' | 'void';
  created_at: string;
  converted_at: string | null;
  name: string | null;
}

export interface ReferralStats {
  code: string;
  total: number;
  registered_free: number;
  converted_paid: number;
  earned_ils: number;
  referrals: ReferralRow[];
}

export function useReferralProgram() {
  const { user } = useAuth();
  const workspaceOwnerId = useActiveWorkspaceOwnerId();

  return useQuery<ReferralStats | null>({
    queryKey: ['referral-stats', workspaceOwnerId],
    enabled: !!user?.id && !!workspaceOwnerId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.rpc('get_my_referral_stats');
      if (error) throw error;
      return (data ?? null) as ReferralStats | null;
    },
  });
}

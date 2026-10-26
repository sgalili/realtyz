import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { isEarnedCredit, playRewardSound, prepareRewardSounds } from '@/lib/rewardFeedback';

type Earning = { id: string; type: string; amount_ils: number; created_at: string };
/** Account-only confirmed ledger events, independent of selected workspace/role. */
export function useEarningsFeedback() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const unlock = () => prepareRewardSounds();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, [user?.id]);
  useQuery({
    queryKey: ['account-earnings-feedback', user?.id], enabled: !!user,
    refetchInterval: 30_000, refetchIntervalInBackground: false,
    refetchOnWindowFocus: true, staleTime: 20_000,
    queryFn: async () => {
      if (!user) return null;
      const key = `toraff:earnings-cursor:${user.id}`;
      let cursor: { since: string; seen: string[] } | null;
      try { cursor = JSON.parse(sessionStorage.getItem(key) ?? 'null'); } catch { cursor = null; }
      if (!cursor?.since || !Array.isArray(cursor.seen)) {
        cursor = { since: new Date().toISOString(), seen: [] };
        sessionStorage.setItem(key, JSON.stringify(cursor));
        return null; // Initial baseline never plays historical earnings.
      }
      const { data, error } = await supabase.rpc('get_my_new_earnings', { _since: cursor.since });
      if (error) throw error;
      const seen = new Set(cursor.seen);
      const fresh = (data as Earning[] ?? []).filter(row => isEarnedCredit(row) && !seen.has(row.id));
      if (fresh.length) {
        // Keep a small overlap for transactions committed just after a poll.
        const newest = fresh[fresh.length - 1];
        cursor = { since: new Date(new Date(newest.created_at).getTime() - 1000).toISOString(), seen: [...cursor.seen, ...fresh.map(row => row.id)].slice(-1000) };
        sessionStorage.setItem(key, JSON.stringify(cursor));
        void playRewardSound('earnings');
      }
      return null;
    },
  });
}
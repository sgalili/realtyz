import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type AutoFlags = {
  auto_reply_positive: boolean;
  auto_reply_negative: boolean;
};

/**
 * Shared query key so every mount point (Inbox, Campaigns, etc.) reads
 * and writes the same React Query cache slot. Flipping a switch in one
 * surface instantly mirrors in every other surface.
 */
export const autoFlagsQueryKey = (userId?: string) => ['workspace-auto-flags', userId];

export function useAutoFlags() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = autoFlagsQueryKey(user?.id);

  const { data: autoFlags = { auto_reply_positive: false, auto_reply_negative: false } } =
    useQuery<AutoFlags>({
      queryKey,
      enabled: !!user,
      queryFn: async () => {
        const { data } = await supabase
          .from('profiles')
          .select('auto_reply_positive, auto_reply_negative')
          .eq('id', user!.id)
          .maybeSingle();
        return {
          auto_reply_positive: Boolean((data as any)?.auto_reply_positive),
          auto_reply_negative: Boolean((data as any)?.auto_reply_negative),
        };
      },
    });

  async function setAutoFlag(field: keyof AutoFlags, value: boolean) {
    if (!user) return;
    queryClient.setQueryData<AutoFlags>(queryKey, (prev) => ({
      auto_reply_positive: prev?.auto_reply_positive ?? false,
      auto_reply_negative: prev?.auto_reply_negative ?? false,
      [field]: value,
    }));
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value } as any)
      .eq('id', user.id);
    if (error) {
      toast.error('עדכון נכשל: ' + error.message);
      queryClient.invalidateQueries({ queryKey });
      return;
    }
    toast.success(value ? 'הגדרה הופעלה' : 'הגדרה כובתה');
    queryClient.invalidateQueries({ queryKey });
  }

  return { autoFlags, setAutoFlag };
}

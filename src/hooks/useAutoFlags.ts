import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
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
  const activeOwnerId = useActiveWorkspaceOwnerId();
  const targetUserId = activeOwnerId ?? user?.id;
  const queryClient = useQueryClient();
  const queryKey = autoFlagsQueryKey(targetUserId ?? undefined);

  const { data: autoFlags = { auto_reply_positive: false, auto_reply_negative: false } } =
    useQuery<AutoFlags>({
      queryKey,
      enabled: !!targetUserId,
      queryFn: async () => {
        const { data } = await supabase
          .from('profiles')
          .select('auto_reply_positive, auto_reply_negative')
          .eq('id', targetUserId!)
          .maybeSingle();
        return {
          auto_reply_positive: Boolean((data as any)?.auto_reply_positive),
          auto_reply_negative: Boolean((data as any)?.auto_reply_negative),
        };
      },
    });

  async function setAutoFlag(field: keyof AutoFlags, value: boolean) {
    if (!targetUserId) return;
    const current = queryClient.getQueryData<AutoFlags>(queryKey) ?? autoFlags;
    const nextFlags: AutoFlags = {
      auto_reply_positive: current.auto_reply_positive ?? false,
      auto_reply_negative: current.auto_reply_negative ?? false,
      [field]: value,
    };
    queryClient.setQueryData<AutoFlags>(queryKey, (prev) => ({
      auto_reply_positive: prev?.auto_reply_positive ?? false,
      auto_reply_negative: prev?.auto_reply_negative ?? false,
      [field]: value,
    }));
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value } as any)
      .eq('id', targetUserId);
    if (error) {
      toast.error('עדכון נכשל: ' + error.message);
      queryClient.invalidateQueries({ queryKey });
      return;
    }
    const shouldEnableAutopilot = nextFlags.auto_reply_positive || nextFlags.auto_reply_negative;
    await (supabase as any)
      .from('platform_settings')
      .upsert({ user_id: targetUserId, enable_ai_autopilot: shouldEnableAutopilot }, { onConflict: 'user_id' });
    toast.success(value ? 'הגדרה הופעלה' : 'הגדרה כובתה');
    queryClient.invalidateQueries({ queryKey });
  }

  return { autoFlags, setAutoFlag };
}

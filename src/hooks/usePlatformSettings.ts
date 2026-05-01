import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface PlatformSettings {
  enable_auto_followups: boolean;
  enable_community_broadcasts: boolean;
  enable_client_portal: boolean;
  enable_broker_referrals: boolean;
  enable_ai_autopilot: boolean;
  enable_voice_calls: boolean;
  enable_featured_listings: boolean;
  enable_pending_extraction: boolean;
}

const DEFAULTS: PlatformSettings = {
  enable_auto_followups: true,
  enable_community_broadcasts: true,
  enable_client_portal: true,
  enable_broker_referrals: true,
  enable_ai_autopilot: true,
  enable_voice_calls: false,
  enable_featured_listings: true,
  enable_pending_extraction: true,
};

export function usePlatformSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['platform-settings', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<PlatformSettings> => {
      const { data, error } = await supabase
        .from('platform_settings' as never)
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error && (error as any).code !== 'PGRST116') throw error;
      if (!data) return DEFAULTS;
      return { ...DEFAULTS, ...(data as any) };
    },
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<PlatformSettings>) => {
      if (!user?.id) throw new Error('not signed in');
      const row = { user_id: user.id, ...query.data, ...patch };
      const { error } = await supabase
        .from('platform_settings' as never)
        .upsert(row as never, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-settings', user?.id] }),
  });

  return {
    settings: query.data ?? DEFAULTS,
    isLoading: query.isLoading,
    update: update.mutateAsync,
    isUpdating: update.isPending,
  };
}

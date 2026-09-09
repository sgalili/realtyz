import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveWorkspaceOwnerId } from '@/hooks/useWorkspace';
import { LISTINGS_ENABLED } from '@/config/workspaceMode';

export interface PlatformSettings {
  enable_auto_followups: boolean;
  enable_community_broadcasts: boolean;
  enable_client_portal: boolean;
  enable_broker_referrals: boolean;
  enable_ai_autopilot: boolean;
  enable_voice_calls: boolean;
  enable_featured_listings: boolean;
  enable_pending_extraction: boolean;
  ai_paused: boolean;
  ai_paused_reason: string | null;
  ai_paused_at: string | null;
}

const DEFAULTS: PlatformSettings = {
  enable_auto_followups: true,
  enable_community_broadcasts: true,
  enable_client_portal: true,
  enable_broker_referrals: true,
  enable_ai_autopilot: false,
  enable_voice_calls: false,
  // Listing management is off in broker-recruitment mode.
  enable_featured_listings: LISTINGS_ENABLED,
  enable_pending_extraction: LISTINGS_ENABLED,
  ai_paused: false,
  ai_paused_reason: null,
  ai_paused_at: null,
};

export function usePlatformSettings() {
  const { user } = useAuth();
  const activeOwnerId = useActiveWorkspaceOwnerId();
  const targetUserId = activeOwnerId ?? user?.id;
  const qc = useQueryClient();
  const storageKey = targetUserId ? `realtyz-platform-settings:${targetUserId}` : null;
  const cached = (() => {
    if (!storageKey || typeof window === 'undefined') return null;
    try { return JSON.parse(window.localStorage.getItem(storageKey) || 'null') as Partial<PlatformSettings> | null; }
    catch { return null; }
  })();

  const query = useQuery({
    queryKey: ['platform-settings', targetUserId],
    enabled: !!targetUserId,
    staleTime: 60_000,
    queryFn: async (): Promise<PlatformSettings> => {
      const { data, error } = await supabase
        .from('platform_settings' as never)
        .select('*')
        .eq('user_id', targetUserId!)
        .maybeSingle();
      if (error && (error as any).code !== 'PGRST116') throw error;
      const next = data ? { ...DEFAULTS, ...(data as any) } : { ...DEFAULTS, ...(cached ?? {}) };
      if (storageKey) window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    },
    initialData: cached ? ({ ...DEFAULTS, ...cached } as PlatformSettings) : undefined,
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<PlatformSettings>) => {
      if (!targetUserId) throw new Error('not signed in');
      const row = { user_id: targetUserId, ...DEFAULTS, ...query.data, ...patch };
      if (storageKey) window.localStorage.setItem(storageKey, JSON.stringify(row));
      qc.setQueryData(['platform-settings', targetUserId], row);
      const { error } = await supabase
        .from('platform_settings' as never)
        .upsert(row as never, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-settings', targetUserId] }),
  });

  return {
    settings: query.data ?? { ...DEFAULTS, ...(cached ?? {}) },
    isLoading: query.isLoading,
    update: update.mutateAsync,
    isUpdating: update.isPending,
  };
}

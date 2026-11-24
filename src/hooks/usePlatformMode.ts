import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PlatformMode = 'brokers_only' | 'full_marketplace';

export function usePlatformMode() {
  return useQuery({
    queryKey: ['platform-mode'],
    queryFn: async (): Promise<PlatformMode> => {
      const { data: rows, error } = await (supabase as any).rpc('get_public_platform_settings');
      if (error) throw error;
      const data = rows?.[0];
      return (data?.platform_mode as PlatformMode) ?? 'brokers_only';
    },
    staleTime: 60_000,
  });
}

/** True while the platform runs as a brokers-only SaaS (also while the setting loads, since it is the default). */
export function useBrokersOnly() {
  const { data } = usePlatformMode();
  return data !== 'full_marketplace';
}

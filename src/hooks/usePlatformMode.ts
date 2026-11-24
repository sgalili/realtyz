import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PlatformMode = 'brokers_only' | 'full_marketplace';

export function usePlatformMode() {
  return useQuery({
    queryKey: ['platform-mode'],
    queryFn: async (): Promise<PlatformMode> => {
      const { data, error } = await supabase.from('platform_system_settings').select('platform_mode').eq('id', true).maybeSingle();
      if (error) throw error;
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

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { setInventoryBrokersOnly } from '@/lib/inventoryCollection';

export type PlatformMode = 'brokers_only' | 'full_marketplace';

export function usePlatformMode() {
  return useQuery({
    queryKey: ['platform-mode'],
    queryFn: async (): Promise<PlatformMode> => {
      const { data: rows, error } = await (supabase as any).rpc('get_public_platform_settings').abortSignal(AbortSignal.timeout(15_000));
      if (error) throw error;
      const data = rows?.[0];
      const mode = (data?.platform_mode as PlatformMode) ?? 'brokers_only';
      setInventoryBrokersOnly(mode !== 'full_marketplace');
      return mode;
    },
    staleTime: 60_000,
  });
}

/** True while the platform runs as a brokers-only SaaS (also while the setting loads, since it is the default). */
export function useBrokersOnly() {
  const { data } = usePlatformMode();
  return data !== 'full_marketplace';
}

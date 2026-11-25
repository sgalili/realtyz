import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const MASTER_BRANDING_KEY = ['platform-master-branding'];
export const BRANDING_UPDATED_EVENT = 'realtyz:branding-updated';

export function useMasterBranding() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: MASTER_BRANDING_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('platform_branding').select('*').eq('id', true).single();
      if (error) throw error;
      return data;
    },
    staleTime: 300_000,
    refetchInterval: 300_000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    const refresh = () => { void client.invalidateQueries({ queryKey: MASTER_BRANDING_KEY }); };
    window.addEventListener(BRANDING_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(BRANDING_UPDATED_EVENT, refresh);
    };
  }, [client]);
  return { ...query, name: query.data?.agency_name || 'TORAFF', logo: query.data?.landscape_logo_url || query.data?.logo_url || null };
}
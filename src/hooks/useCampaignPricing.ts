import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CampaignPrice } from '@/lib/campaignServicePricing';

export function useCampaignPricing(enabled = true) {
  return useQuery({
    queryKey: ['action-pricing'], enabled, staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('action_pricing')
        .select('action_key,label_he,unit_he,price_agorot').order('sort_order');
      if (error) throw error;
      return (data ?? []) as CampaignPrice[];
    },
  });
}
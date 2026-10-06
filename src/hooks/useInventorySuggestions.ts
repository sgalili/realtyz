import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { mapLocalListingRow } from '@/lib/propertySearch';

export function useInventorySuggestions(term: string, workspaceId: string | null) {
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(term.trim()), 180); return () => window.clearTimeout(timer); }, [term]);
  return useQuery({
    queryKey: ['inventory-suggestions', workspaceId, debounced],
    enabled: !!workspaceId && debounced.length >= 2 && !/yad2\.co\.il|https?:\/\//i.test(debounced),
    queryFn: async () => {
      if (!workspaceId) return [];
      const words = debounced.replace(/[,()%_*\\"']/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6);
      if (!words.length) return [];
      let query = supabase.from('listings').select('id,property_title,address,city,house_number,asking_price,deal_type,rooms,source,source_url,media_photos,created_at').eq('workspace_owner_id', workspaceId).neq('status', 'discarded');
      for (const word of words) query = query.or(`property_title.ilike.%${word}%,address.ilike.%${word}%,city.ilike.%${word}%`);
      const { data, error } = await query.order('created_at', { ascending: false }).limit(8);
      if (error) throw error;
      return (data ?? []).map(mapLocalListingRow);
    },
    staleTime: 15_000,
  });
}

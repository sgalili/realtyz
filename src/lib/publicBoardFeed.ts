import { supabase } from '@/integrations/supabase/client';
import { boundedRequest } from '@/lib/boundedRequest';
import type { PublicCard } from '@/pages/PublicListingsBoard';
/** One server-redacted inventory for home and sharing activity. */
export async function fetchPublicBoardFeed(): Promise<PublicCard[]> {
  const all = new Map<string, PublicCard>();
  for (let offset = 0; ; offset += 60) {
    const params = new URLSearchParams({ limit: '60', offset: String(offset) });
    const { data, error } = await boundedRequest(supabase.functions.invoke(`public-listings-board?${params}`, { method: 'GET' }));
    if (error) throw error;
    const rows = (data?.properties ?? []) as PublicCard[];
    const before = all.size;
    rows.forEach(row => all.set(row.id, row));
    if (data?.has_more !== true || all.size === before) return [...all.values()];
  }
}
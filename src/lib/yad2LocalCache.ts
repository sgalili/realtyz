import { supabase } from '@/integrations/supabase/client';

/** Only the active workspace's exact source identity may satisfy an import. */
export async function readRecentYad2Listing(itemId: string | null, workspaceOwnerId: string | null) {
  if (!itemId || !workspaceOwnerId) return null;
  const { data, error } = await supabase.from('listings').select('*')
    .eq('workspace_owner_id', workspaceOwnerId).eq('source', 'yad2')
    .eq('external_id', itemId.toLowerCase()).limit(1).maybeSingle();
  if (error || !data) return null;
  const meta = (data.source_metadata ?? {}) as Record<string, any>;
  const fetchedAt = meta.source_fetched_at ?? meta.scraped_at;
  const age = Date.now() - Date.parse(String(fetchedAt ?? ''));
  if (!Number.isFinite(age) || age < 0 || age >= 24 * 60 * 60 * 1000) return null;
  const features = Array.isArray(data.features) ? data.features[0] : data.features;
  const feature = (features ?? {}) as Record<string, any>;
  const attrs = (data.attributes ?? {}) as Record<string, any>;
  return {
    success: true, cached: true, served_from: 'workspace_db', listing_id: data.id,
    results: [{ ...data, title: data.property_title, price: data.asking_price,
      photos: data.media_photos ?? meta.photos ?? meta.cached_media_urls ?? [],
      description: data.description, long_description: data.description,
      deal_type: feature.listing_type ?? data.deal_type,
      attributes: { ...attrs, ...feature.extras, property_type: feature.property_type ?? attrs.property_type ?? meta.property_type },
      owner_phone: meta.owner_phone, owner_name: meta.owner_name,
    }],
  };
}
import { supabase } from '@/integrations/supabase/client';
import { publicUrl } from '@/lib/publicUrl';

export function propertyInquiryRef(search = window.location.search): string | null {
  const code = new URLSearchParams(search).get('ref');
  return code && /^[a-z0-9]{4,32}$/i.test(code) ? code : null;
}

export async function personalPropertyLink(listingId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_property_referral_link', { _listing_id: listingId });
  if (error || !data) throw error ?? new Error('link unavailable');
  const url = new URL(data);
  return publicUrl(`${url.pathname}${url.search}`);
}
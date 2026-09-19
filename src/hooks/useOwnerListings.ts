import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Private property owner data layer.
 *
 * A private owner is NOT a broker: they never see workspace CRM data. RLS only
 * exposes `listings` rows whose `owner_id` is their own account, and only the
 * public-board interest records tied to those listings.
 */
export type OwnerListing = {
  id: string;
  property_title: string | null;
  address: string | null;
  city: string | null;
  neighborhood: string | null;
  deal_type: string | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  asking_price: number | null;
  description: string | null;
  image_url: string | null;
  media_photos: unknown;
  is_published: boolean | null;
  affiliate_enabled: boolean | null;
  affiliate_tier1_amount: number | null;
  affiliate_tier2_amount: number | null;
  affiliate_tier3_amount: number | null;
};

export type OwnerInterest = {
  id: string;
  listing_id: string;
  visitor_name: string;
  visitor_phone: string;
  callback_window: string | null;
  intent: string | null;
  rita_engaged_at: string | null;
  unlocked_at: string | null;
  created_at: string;
};

const OWNER_COLUMNS =
  'id, property_title, address, city, neighborhood, deal_type, rooms, sqm, floor, asking_price, description, image_url, media_photos, is_published, affiliate_enabled, affiliate_tier1_amount, affiliate_tier2_amount, affiliate_tier3_amount';

export function useOwnerListings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['owner-listings', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(OWNER_COLUMNS)
        .eq('owner_id', user!.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OwnerListing[];
    },
  });
}

export function useOwnerInterest() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['owner-interest', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_listing_interest')
        .select('id, listing_id, visitor_name, visitor_phone, callback_window, intent, rita_engaged_at, unlocked_at, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as OwnerInterest[];
    },
  });
}

export function useUpdateOwnerListing() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase
        .from('listings')
        .update(patch as never)
        .eq('id', id)
        .eq('owner_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['owner-listings'] });
    },
  });
}

/** Photo URLs of an owner listing, main image first. */
export function ownerListingPhotos(listing: OwnerListing): string[] {
  const out: string[] = [];
  const media = listing.media_photos;
  if (Array.isArray(media)) {
    for (const item of media) {
      const url = typeof item === 'string' ? item : (item as any)?.url ?? (item as any)?.src;
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) out.push(url);
    }
  }
  if (listing.image_url && !out.includes(listing.image_url)) out.unshift(listing.image_url);
  return out;
}

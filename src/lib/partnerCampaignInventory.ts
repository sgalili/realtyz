import { fetchPublicBoardFeed } from '@/lib/publicBoardFeed';
import { visibleToListingAudience } from '@/lib/listingAudience';

/** Reuse the same available inventory as partner sharing, without private facts. */
export async function fetchPartnerCampaignInventory(verifiedBroker: boolean) {
  const cards = await fetchPublicBoardFeed();
  return cards
    .filter(card => card.affiliate_enabled === true && visibleToListingAudience(card.reward_types, true, verifiedBroker))
    .map(card => ({
      id: card.id,
      property_title: card.title,
      description: card.description,
      city: card.city,
      neighborhood: card.neighborhood,
      address: card.street,
      rooms: card.rooms,
      sqm: card.sqm,
      floor: card.floor,
      asking_price: card.price,
      deal_type: card.deal_type,
      media_photos: card.photos,
      features: null,
      source_metadata: null,
      status: null,
      is_published: null,
      created_at: null,
    }));
}
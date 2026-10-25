/** Only public property facts may enter a foreign-workspace campaign. Never rewards, contacts or owner metadata. */
export function publicCampaignProperty(property: Record<string, unknown>, selectedId: string): Record<string, unknown> | null {
  if (property.id !== selectedId) return null;
  const fields = ['id', 'property_title', 'address', 'neighborhood', 'city', 'deal_type', 'rooms', 'sqm', 'floor', 'asking_price', 'description', 'short_description', 'long_description', 'media_photos', 'image_url', 'elevator', 'parking', 'available_from'];
  return Object.fromEntries(fields.filter(key => property[key] !== undefined).map(key => [key, property[key]]));
}
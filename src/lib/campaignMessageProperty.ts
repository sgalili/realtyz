export type CampaignMessageProperty = {
  id: string;
  property_title: string | null;
  address: string | null;
  city: string | null;
};

export function campaignMessagePropertyLabel(property: CampaignMessageProperty): string {
  return [property.property_title, property.address, property.city].filter(Boolean).join(' · ') || 'נכס ללא כותרת';
}

export function sameCampaignMessageContext(
  requested: { propertyId: string | null; workspaceId: string | null },
  current: { propertyId: string | null; workspaceId: string | null },
): boolean {
  return requested.propertyId === current.propertyId && requested.workspaceId === current.workspaceId;
}
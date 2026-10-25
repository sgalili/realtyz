/** Explicit property actions never restore another property's draft or schedule. */
export function canRestorePropertyDraft(target: string | null, draft: { selectedListingId?: string | null } | null | undefined): boolean {
  return !target || draft?.selectedListingId === target;
}

export function propertyCampaignSelection(params: URLSearchParams): string[] {
  const properties = (params.get('properties') || '').split(',').map(id => id.trim()).filter(Boolean);
  return [...new Set(properties.length ? properties : [params.get('listing') || ''].filter(Boolean))];
}
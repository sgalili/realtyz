export type OfficeField = 'agency_name' | 'logo_url' | 'office_address' | 'public_email' | 'brokerage_name' | 'brokerage_license';

/** Each confirmation persists one field, never other unconfirmed drafts. */
export function workspaceDetailPatch(ownerId: string, field: OfficeField, value: string) {
  return { user_id: ownerId, [field]: value.trim() || null };
}
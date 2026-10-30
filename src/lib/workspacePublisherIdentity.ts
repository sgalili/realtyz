type OwnerProfile = { full_name?: string | null; phone?: string | null; email?: string | null };
export function workspacePublisherIdentity(ownerId: string | null, profileOwnerId: string | null, profile: OwnerProfile | null | undefined) {
  if (!ownerId || ownerId !== profileOwnerId || !profile) return { name: '', phone: '', email: '' };
  return { name: profile.full_name ?? '', phone: profile.phone ?? '', email: profile.email ?? '' };
}
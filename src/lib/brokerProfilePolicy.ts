export function registryIdentityLocked(profile: { locked_broker_name?: string | null; locked_broker_city?: string | null }) {
  return profile.locked_broker_name != null || profile.locked_broker_city != null;
}

export function mayFetchRegistryInReview(input: { superAdmin: boolean; pending: boolean; registryHolderName?: string | null; identityLocked: boolean }) {
  return input.superAdmin && input.pending && !input.registryHolderName && !input.identityLocked;
}

export function mayEditBrokerIdentityField(field: string, locked: boolean) {
  return !locked || (field !== 'fullName' && field !== 'city');
}
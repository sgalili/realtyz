export function registryIdentityLocked(profile: { locked_broker_name?: string | null; locked_broker_city?: string | null }) {
  return profile.locked_broker_name != null || profile.locked_broker_city != null;
}

export function mayFetchRegistryInReview(input: { superAdmin: boolean; pending: boolean; registryHolderName?: string | null; identityLocked: boolean }) {
  return input.superAdmin && input.pending && !input.registryHolderName && !input.identityLocked;
}

export function mayEditBrokerIdentityField(field: string, locked: boolean) {
  return !locked || (field !== 'fullName' && field !== 'city');
}

export function brokerLicenseState(input: { evidenceLicense?: string | null; storedLicense: string; active: boolean | null; suspended: boolean; approvedLicense?: string | null }) {
  const verified = !!input.storedLicense && input.evidenceLicense === input.storedLicense;
  const approved = !verified && !!input.storedLicense && input.approvedLicense === input.storedLicense;
  return { verified, approved, active: (verified || approved) && input.active === true && !input.suspended };
}
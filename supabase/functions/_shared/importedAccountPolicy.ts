export type ImportedAccountType = 'broker' | 'developer' | 'property_owner' | 'property_seeker' | 'affiliate';

export function requiresLicenseVerification(userType: ImportedAccountType) {
  return userType === 'broker';
}

export function allowsQueuedContactlessAccount(userType: ImportedAccountType, importJobId?: string) {
  return Boolean(importJobId) && (userType === 'broker' || userType === 'developer');
}

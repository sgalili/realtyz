export type ImportedAccountType = 'broker' | 'developer' | 'property_owner' | 'property_seeker' | 'affiliate';

export function requiresLicenseVerification(userType: ImportedAccountType) {
  return userType === 'broker';
}

export function allowsQueuedContactlessAccount(userType: ImportedAccountType, importJobId?: string) {
  return Boolean(importJobId) && (userType === 'broker' || userType === 'developer');
}

/** Stable per job+source identity makes a repeated provisioning request safe. */
export async function developerImportPlaceholderId(importJobId: string, sourceUrl: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${importJobId}\n${sourceUrl}`));
  const suffix = Array.from(new Uint8Array(digest).slice(0, 10), byte => byte.toString(16).padStart(2, '0')).join('');
  return `developer-${importJobId.slice(0, 8)}-${suffix}`;
}

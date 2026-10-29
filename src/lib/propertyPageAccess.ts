import type { AppRole } from '@/hooks/useUserRole';

/** Inputs must come from authenticated server role and license reads. */
export function propertyPageAccess(roles: readonly AppRole[], verifiedLicense: boolean, ready: boolean) {
  return {
    properties: ready && verifiedLicense && roles.some(role => ['managing_broker', 'lead_agent', 'agent'].includes(role)),
    projects: ready && roles.includes('developer'),
    providerDiagnostics: ready && roles.includes('super_admin'),
  };
}
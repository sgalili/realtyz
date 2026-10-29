import { describe, expect, it } from 'vitest';
import { propertyPageAccess } from './propertyPageAccess';
import type { AppRole } from '@/hooks/useUserRole';

describe('property page access', () => {
  it.each(['agent', 'lead_agent', 'managing_broker'] as const)('permits verified %s properties', role => {
    expect(propertyPageAccess([role], true, true).properties).toBe(true);
    expect(propertyPageAccess([role], false, true).properties).toBe(false);
  });
  it.each(['user', 'affiliate', 'developer', 'property_owner', 'property_seeker', 'super_admin', 'admin', 'assistant', 'junior_agent'] as AppRole[])('does not grant properties to %s from a license alone', role => {
    expect(propertyPageAccess([role], true, true).properties).toBe(false);
  });
  it('allows projects exclusively for developer roles', () => {
    expect(propertyPageAccess(['developer'], false, true).projects).toBe(true);
    expect(propertyPageAccess(['super_admin'], true, true).projects).toBe(false);
    expect(propertyPageAccess(['agent'], true, true).projects).toBe(false);
  });
  it('restricts provider warnings to the signed-in super admin', () => {
    expect(propertyPageAccess(['super_admin'], false, true).providerDiagnostics).toBe(true);
    expect(propertyPageAccess(['admin'], true, true).providerDiagnostics).toBe(false);
    expect(propertyPageAccess(['managing_broker'], true, true).providerDiagnostics).toBe(false);
  });
  it('fails closed while permissions are loading or have failed', () => {
    expect(propertyPageAccess(['super_admin', 'developer', 'agent'], true, false)).toEqual({ properties: false, projects: false, providerDiagnostics: false });
  });
});
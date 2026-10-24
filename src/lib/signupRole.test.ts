import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), maybeRoles: vi.fn(), getUser: vi.fn(), invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: mocks.getUser },
  from: () => ({ select: () => ({ eq: mocks.maybeRoles }) }),
  rpc: mocks.rpc,
  functions: { invoke: mocks.invoke },
} }));
import { applyPendingSignupRole, setPendingSignupRole, setPendingSignupName, readPendingSignupRole } from './signupRole';
import { savePendingBrokerLicense } from './brokerLicense';

describe('primary signup choices', () => {
  beforeEach(() => {
    localStorage.clear(); vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
    mocks.maybeRoles.mockResolvedValue({ data: [], error: null });
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
    mocks.invoke.mockResolvedValue({ data: { valid: true }, error: null });
  });
  it.each(['broker', 'developer', 'contractor', 'property_owner', 'property_seeker', 'partner'] as const)('sends explicit %s choice to the constrained server operation', async type => {
    setPendingSignupRole(type);
    if (type === 'broker') savePendingBrokerLicense('30722789');
    expect(await applyPendingSignupRole()).toBe('/');
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('select_signup_user_type', { _type: type });
  });
  it('never changes an established developer from a stale broker preference', async () => {
    mocks.maybeRoles.mockResolvedValue({ data: [{ role: 'developer' }], error: null });
    setPendingSignupRole('broker');
    expect(await applyPendingSignupRole()).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('inherits partner signup without broker verification or accepting terms', async () => {
    setPendingSignupRole('partner');
    expect(await applyPendingSignupRole()).toBe('/');
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('select_signup_user_type', { _type: 'partner' });
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(readPendingSignupRole()).toBeNull();
  });
  it('persists the entered full name after verified authentication before applying type', async () => {
    setPendingSignupRole('partner'); setPendingSignupName('שי גלילי');
    await applyPendingSignupRole();
    expect(mocks.rpc.mock.calls).toEqual([
      ['complete_signup_profile', { _full_name: 'שי גלילי' }],
      ['select_signup_user_type', { _type: 'partner' }],
    ]);
  });
  it('retains signup intent when name persistence fails', async () => {
    setPendingSignupRole('partner'); setPendingSignupName('שי גלילי');
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('save failed') });
    expect(await applyPendingSignupRole()).toBeNull();
    expect(readPendingSignupRole()).toBe('partner');
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('complete_signup_profile', { _full_name: 'שי גלילי' });
  });
  it('never writes signup data before authentication is verified', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    setPendingSignupRole('partner'); setPendingSignupName('שי גלילי');
    expect(await applyPendingSignupRole()).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not assign a role without an explicit choice', async () => {
    expect(await applyPendingSignupRole()).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not grant broker signup without a license', async () => {
    setPendingSignupRole('broker');
    expect(await applyPendingSignupRole()).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('blocks broker signup when the official register rejects the number', async () => {
    setPendingSignupRole('broker'); savePendingBrokerLicense('9999999999');
    mocks.invoke.mockResolvedValue({ data: { valid: false }, error: null });
    expect(await applyPendingSignupRole()).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rechecks the broker license server-side after sign-in before granting the role', async () => {
    setPendingSignupRole('broker'); savePendingBrokerLicense('30722789');
    await applyPendingSignupRole();
    expect(mocks.invoke).toHaveBeenCalledWith('verify-broker-license', { body: { licenseNumber: '30722789', action: 'verify' } });
  });
});
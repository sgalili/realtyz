import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), maybeRoles: vi.fn(), getUser: vi.fn(), invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: mocks.getUser },
  from: () => ({ select: () => ({ eq: mocks.maybeRoles }) }),
  rpc: mocks.rpc,
  functions: { invoke: mocks.invoke },
} }));
import { applyPendingSignupRole, setPendingSignupRole } from './signupRole';
import { savePendingBrokerLicense } from './brokerLicense';

describe('primary signup choices', () => {
  beforeEach(() => {
    localStorage.clear(); vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
    mocks.maybeRoles.mockResolvedValue({ data: [], error: null });
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
    mocks.invoke.mockResolvedValue({ data: { valid: true }, error: null });
  });
  it.each(['broker', 'developer', 'contractor', 'property_owner', 'property_seeker'] as const)('sends explicit %s choice to the constrained server operation', async type => {
    setPendingSignupRole(type);
    if (type === 'broker') savePendingBrokerLicense('30722789');
    await applyPendingSignupRole();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('select_signup_user_type', { _type: type });
  });
  it('never changes an established developer from a stale broker preference', async () => {
    mocks.maybeRoles.mockResolvedValue({ data: [{ role: 'developer' }], error: null });
    setPendingSignupRole('broker');
    expect(await applyPendingSignupRole()).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not accept partner as a primary type or bypass terms', async () => {
    setPendingSignupRole('partner');
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
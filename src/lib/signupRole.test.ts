import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), maybeRoles: vi.fn(), getUser: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: mocks.getUser },
  from: () => ({ select: () => ({ eq: mocks.maybeRoles }) }),
  rpc: mocks.rpc,
} }));
import { applyPendingSignupRole, setPendingSignupRole } from './signupRole';

describe('primary signup choices', () => {
  beforeEach(() => {
    localStorage.clear(); vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
    mocks.maybeRoles.mockResolvedValue({ data: [], error: null });
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
  });
  it.each(['broker', 'developer', 'contractor', 'property_owner', 'property_seeker'] as const)('sends explicit %s choice to the constrained server operation', async type => {
    setPendingSignupRole(type);
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
});
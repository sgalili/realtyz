import { describe, expect, it } from 'vitest';
import { brokerInvitation, firstBrokerDestination } from './brokerInvitation';
import { recipientIsSilent } from '../../supabase/functions/_shared/adminOnboarding';

describe('admin broker onboarding', () => {
  it('invitation uses broker-specific public OTP login, never credentials or preview origin', () => {
    const invitation = brokerInvitation({ id: 'broker-id', full_name: 'דולי אידלסון' });
    expect(invitation.link).toBe('https://toraff.co.il/auth?broker=broker-id');
    expect(new URL(invitation.link).searchParams.has('token')).toBe(false);
  });
  it('only server first-login destination changes normal homepage routing', () => {
    expect(firstBrokerDestination('/properties')).toBe('/properties');
    expect(firstBrokerDestination('/')).toBe('/');
    expect(firstBrokerDestination('https://attacker.example')).toBe('/');
  });
  it('suppresses broker messages before first login', async () => {
    expect(await recipientIsSilent({ rpc: async () => ({ data: true }) }, '0522973500')).toBe(true);
  });
  it('allows normal notification handling after first login', async () => {
    expect(await recipientIsSilent({ rpc: async () => ({ data: false }) }, '0522973500')).toBe(false);
  });
  it('fails closed if silence state is unavailable', async () => {
    await expect(recipientIsSilent({ rpc: async () => ({ error: new Error('offline') }) }, '0522973500')).rejects.toThrow('onboarding_delivery_guard_unavailable');
  });
});
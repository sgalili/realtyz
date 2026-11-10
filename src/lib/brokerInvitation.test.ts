import { describe, expect, it } from 'vitest';
import {
  BROKER_INVITATION_TEMPLATE,
  brokerInvitation,
  firstBrokerDestination,
  renderBrokerInvitation,
} from './brokerInvitation';
import { recipientIsSilent } from '../../supabase/functions/_shared/adminOnboarding';

describe('admin broker onboarding', () => {
  it('invitation uses broker-specific public OTP login, never credentials or preview origin', () => {
    const invitation = brokerInvitation({ id: 'broker-id', full_name: 'דולי אידלסון' });
    expect(invitation.link).toBe('https://toraff.co.il/auth?broker=broker-id');
    expect(new URL(invitation.link).searchParams.has('token')).toBe(false);
  });
  it('invitation copy is the fixed wording with name and link filled in', () => {
    expect(BROKER_INVITATION_TEMPLATE).toContain('{brokerName}');
    expect(BROKER_INVITATION_TEMPLATE).toContain('{authLink}');
    const invitation = brokerInvitation({ id: 'broker-id', full_name: 'דולי אידלסון' });
    expect(invitation.message).toContain('שלום דולי אידלסון,\nלבקשת אודי ויטמן');
    expect(invitation.message).toContain('ממתינים לאישורך כדי להתפרסם בלוח החדש והמטורף שלנו 🚀');
    expect(invitation.message).toContain('עמלת הסגירה ותמחור לידים');
    expect(invitation.message).toContain('קוד אימות:\nhttps://toraff.co.il/auth?broker=broker-id\n');
    expect(invitation.message.endsWith('בברכה,\nצוות TORAFF')).toBe(true);
    expect(invitation.message).not.toContain('{');
  });
  it('invitation greeting stays clean without a broker name', () => {
    const message = renderBrokerInvitation(BROKER_INVITATION_TEMPLATE, { brokerName: '  ', authLink: 'https://toraff.co.il/auth?broker=x' });
    expect(message.startsWith('שלום,\nלבקשת')).toBe(true);
    expect(message).toContain('https://toraff.co.il/auth?broker=x');
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
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
    expect(invitation.message).toBe(
      'שלום דולי אידלסון,\n\n' +
      'לבקשת אודי ויטמן, יועץ נדל״ן מהרצליה, הכנו עבורך מרחב עבודה במערכת TORAFF והזנו את כל הנכסים שלך.\n\n' +
      'לכניסה לחץ על הקישור וקבל קוד אימות:\n\n' +
      'https://toraff.co.il/auth?broker=broker-id\n\n' +
      'לאחר הזנת הקוד ייפתח מסך הנכסים שלך. כל שנותר הוא להגדיר את עמלת הסגירה שאתה מציע לשותפים, לכל נכס בנפרד או לכל הנכסים בבת אחת.\n\n' +
      'אם נתקלת בבעיה או יש לך שאלות, ניתן לפנות ישירות:\n\n' +
      'אודי ויטמן: 0522973500\n\n' +
      'שי גלילי, המפתח והאחראי הטכנולוגי הראשי: 0546811841\n\n' +
      'בברכה,\n\n' +
      'צוות TORAFF',
    );
    expect(invitation.message).not.toContain('{');
  });
  it('invitation greeting stays clean without a broker name', () => {
    const message = renderBrokerInvitation(BROKER_INVITATION_TEMPLATE, { brokerName: '  ', authLink: 'https://toraff.co.il/auth?broker=x' });
    expect(message.startsWith('שלום,\n\n')).toBe(true);
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
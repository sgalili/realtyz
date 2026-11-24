import { describe, expect, it } from 'vitest';
import { demoInvitationLink, demoTypeForRoles } from '../../supabase/functions/_shared/importInvitationPolicy';
import { brokerInvitationEmailHtml } from '../../supabase/functions/_shared/brokerInvitationEmail';

describe('role-aware public demo invitations', () => {
  it.each([
    [['agent'], 'broker'],
    [['marketing_company'], 'marketing'],
    [['developer'], 'developer'],
    [['property_owner'], 'owner'],
    [['property_seeker'], 'buyer'],
    [['affiliate'], 'affiliate'],
  ] as const)('maps %s to its matching public demo', (roles, type) => {
    expect(demoTypeForRoles([...roles])).toBe(type);
    expect(demoInvitationLink('https://toraff.co.il', [...roles])).toBe(`https://toraff.co.il/demo/${type}`);
  });

  it('routes an unknown user type to role selection', () => {
    expect(demoTypeForRoles(['user'])).toBeNull();
    expect(demoInvitationLink('https://toraff.co.il', [])).toBe('https://toraff.co.il/demo');
  });

  it('uses the broker demo when a broker also has a partner role', () => {
    expect(demoInvitationLink('https://toraff.co.il', ['affiliate', 'agent'])).toBe('https://toraff.co.il/demo/broker');
  });

  it('uses the demo link in the default email without shared credentials or OTP instructions', () => {
    const html = brokerInvitationEmailHtml({ firstName: 'דנה', examples: [], link: 'https://toraff.co.il/demo/developer', unsubscribeUrl: 'https://toraff.co.il/unsubscribe', demo: true });
    expect(html).toContain('https://toraff.co.il/demo/developer');
    expect(html).not.toContain('0501234567');
    expect(html).not.toContain('1234');
  });
});

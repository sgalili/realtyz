import { describe, expect, it } from 'vitest';
import { brokerStage, templateBody, BROKER_TEMPLATE_BODY, invitationTemplateName, officialBrokerPhone, invitationTargetPhone, invitationTextFor, coldInvitationBody } from '../../supabase/functions/_shared/brokerInvitationTemplate';

describe('official broker invitation rules', () => {
  it('retires the old warm-contact default but keeps deliberately edited templates', () => {
    expect(invitationTextFor('בהמשך לשיחתינו {brokerName} {authLink}', 'female', ['developer'])).toBe(coldInvitationBody('female', ['developer']));
    const custom = 'custom {brokerName} {authLink}';
    expect(invitationTextFor(custom, 'female', ['developer'])).toBe(custom);
  });
  it('sends a broker invitation to saved WhatsApp even when the login and contact phones differ', () => {
    expect(invitationTargetPhone('972502222222', '972503333333', '972504444444', true)).toBe('972502222222');
  });
  it('refuses a missing or invalid WhatsApp number without falling back to the login phone', () => {
    expect(invitationTargetPhone(null, null, '972504444444', true)).toBeNull();
    expect(invitationTargetPhone('1234', null, '972504444444', true)).toBeNull();
  });
  it('requires authentication after accepted invitation, never property review before login', () => {
    expect(brokerStage({ invited_at: '2026-11-10', pending_properties: 8, published_properties: 0 })).toBe('pending_otp');
    expect(brokerStage({ pending_properties: 8, published_properties: 0 })).toBe('not_invited');
  });
  it('shows remaining property review even when some properties are already published', () => {
    expect(brokerStage({ first_login_at: '2026-11-10', pending_properties: 2, published_properties: 4 })).toBe('pending_property_review');
    expect(brokerStage({ first_login_at: '2026-11-10', pending_properties: 0, published_properties: 4 })).toBe('published');
  });
  it('does not claim publication without inventory', () => {
    expect(brokerStage({ first_login_at: '2026-11-10', pending_properties: 0, published_properties: 0 })).toBe('pending_inventory');
  });
  it('defaults to a view-only demo link and validates variables', () => {
    const body = templateBody(BROKER_TEMPLATE_BODY);
    expect(body.match(/\{\{\d\}\}/g)).toEqual(['{{1}}', '{{2}}']);
    expect(BROKER_TEMPLATE_BODY).toContain('ללא צורך בהרשמה או קוד אימות');
    expect(BROKER_TEMPLATE_BODY).not.toContain('אחרי כניסה עם קוד אימות');
    expect(() => templateBody(BROKER_TEMPLATE_BODY.replace('{brokerName}', ''))).toThrow();
    expect(() => templateBody(BROKER_TEMPLATE_BODY + ' {unknown}')).toThrow();
    expect(() => templateBody('{authLink} ' + BROKER_TEMPLATE_BODY.replace('{authLink}', ''))).toThrow();
  });
  it('requires a different approval for every fixed-text edit', async () => {
    const body = templateBody(BROKER_TEMPLATE_BODY);
    expect(await invitationTemplateName(body)).toBe(await invitationTemplateName(body));
    expect(await invitationTemplateName(body + ' תודה.')).not.toBe(await invitationTemplateName(body));
  });
  it('normalizes broker recipient phones and rejects invalid numbers', () => {
    expect(officialBrokerPhone('052-2973500')).toBe('972522973500');
    expect(officialBrokerPhone('+972522973500')).toBe('972522973500');
    expect(officialBrokerPhone('1234')).toBeNull();
  });
});
import { describe, expect, it } from 'vitest';
import { brokerStage, templateBody, BROKER_TEMPLATE_BODY, invitationTemplateName, officialBrokerPhone } from '../../supabase/functions/_shared/brokerInvitationTemplate';

describe('official broker invitation rules', () => {
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
  it('defaults to link-less wording and validates variables', () => {
    const body = templateBody(BROKER_TEMPLATE_BODY);
    expect(body.match(/\{\{\d\}\}/g)).toEqual(['{{1}}']);
    expect(templateBody(BROKER_TEMPLATE_BODY.replace('בברכה', 'קישור: {authLink} בברכה'))).toContain('{{2}}');
    expect(() => templateBody(BROKER_TEMPLATE_BODY.replace('{brokerName}', ''))).toThrow();
    expect(() => templateBody(BROKER_TEMPLATE_BODY + ' {unknown}')).toThrow();
    expect(() => templateBody('{authLink} ' + BROKER_TEMPLATE_BODY)).toThrow();
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
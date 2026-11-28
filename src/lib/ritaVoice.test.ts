import { describe, expect, it } from 'vitest';
import { buildRitaDynamicVariables, firstNameFromFullName, isPlaceholderLeadName, normalizeRitaConfigurationOrigin, normalizeRitaPhone, propertyContextFromListing, ritaOpeningFrame, ritaOutboundInputSchema, ritaPropertySearchSchema, ritaProviderVariables } from './ritaVoice';

 describe('Rita voice contracts', () => {
  it('uses only the first token for lead_name and retains the full name separately', () => {
    const variables = buildRitaDynamicVariables({ fullName: 'דנה כהן לוי', phone: '050-1234567', source: 'property_callback', agencyName: 'משרד הדוגמה', agentName: 'דני לוי', brokerId: 'broker-a' });
    expect(firstNameFromFullName('דנה כהן לוי')).toBe('דנה');
    expect(variables.lead_name).toBe('דנה');
    expect(variables.lead_full_name).toBe('דנה כהן לוי');
    expect(variables.lead_phone).toBe('+972501234567');
    expect(variables.agency_name).toBe('משרד הדוגמה');
  });
  it('defaults general and demo calls to TORAFF', () => {
    const variables = buildRitaDynamicVariables({ source: 'demo' });
    expect(variables.agency_name).toBe('TORAFF');
    expect(variables.agent_name).toBe('TORAFF');
    expect(variables.broker_id).toBe('');
    expect(variables.property_context).toEqual({});
    expect(variables.call_role).toBe('general_inbound');
  });
  it('includes exact property facts and identifiers', () => {
    const property = propertyContextFromListing({ id: 'property-a', property_title: 'דירת גן', city: 'הרצליה', neighborhood: 'המרכז', rooms: 4, asking_price: 2500000, deal_type: 'sale' });
    const variables = buildRitaDynamicVariables({ source: 'property_card', property });
    expect(variables.property_id).toBe('property-a');
    expect(variables.property_context).toEqual({ property_id: 'property-a', title: 'דירת גן', city: 'הרצליה', neighborhood: 'המרכז', rooms: 4, price: 2500000, deal_type: 'sale' });
  });
  it.each(['property_lead', 'broker_invite', 'broker_support', 'general_inbound'] as const)('preserves the explicit %s hat and invitation context', callRole => {
    const variables = buildRitaDynamicVariables({ source: 'verified_call', callRole, inviteContext: 'ביקוש לדירה בהרצליה' });
    expect(variables.call_role).toBe(callRole);
    expect(variables.hat).toBe(callRole);
    expect(variables.invite_context).toBe('ביקוש לדירה בהרצליה');
  });
  it('rejects unknown call hats', () => {
    expect(ritaOutboundInputSchema.safeParse({ call_role: 'admin' }).success).toBe(false);
  });
  it('frames an explicit post-invite stage without changing its broker hat', () => {
    const variables = buildRitaDynamicVariables({ source: 'welcome', callRole: 'broker_support', brokerStage: 'onboarded_welcome' });
    expect(ritaOpeningFrame(variables)).toBe('broker_onboarded');
    expect(variables.call_role).toBe('broker_support');
  });
  it('keeps existing broker support separate from post-invite onboarding', () => {
    expect(ritaOpeningFrame(buildRitaDynamicVariables({ source: 'broker_assistant', callRole: 'broker_support' }))).toBe('broker_support');
  });
  it.each(['property_lead', 'general_inbound'] as const)('uses the authorized %s opening despite unrelated welcome context', callRole => {
    expect(ritaOpeningFrame(buildRitaDynamicVariables({ source: 'call', callRole, brokerStage: 'onboarded_welcome' }))).toBe(callRole);
  });
  it('frames the consented first-login invitation as welcome without changing its broker hat', () => {
    const variables = buildRitaDynamicVariables({ source: 'broker_invitation', callRole: 'broker_invite', brokerStage: 'onboarded_welcome' });
    expect(ritaOpeningFrame(variables)).toBe('broker_onboarded');
    expect(variables.hat).toBe('broker_invite');
  });
  it('keeps an unaccepted broker invitation in the partnership frame', () => {
    expect(ritaOpeningFrame(buildRitaDynamicVariables({ source: 'invite', callRole: 'broker_invite' }))).toBe('broker_invite');
  });
  it('does not reframe real property calls from arbitrary seller instructions', () => {
    expect(ritaOpeningFrame(buildRitaDynamicVariables({ source: 'call', callRole: 'property_lead', instructions: 'מעוניין למכור נכס' }))).toBe('property_lead');
  });
  it('serializes property facts for the provider without losing structured context', () => {
    const variables = buildRitaDynamicVariables({ source: 'property_call', callRole: 'property_lead', property: propertyContextFromListing({ id: 'property-a', rooms: 4, asking_price: 2500000 }) });
    const sent = ritaProviderVariables(variables);
    expect(typeof sent['property_context']).toBe('string');
    expect(JSON.parse(String(sent['property_context']))).toMatchObject({ property_id: 'property-a', rooms: 4, price: 2500000 });
    expect(variables.property_context).toMatchObject({ rooms: 4 });
  });
  it('requires valid bounded input and normalizes Israeli phones', () => {
    expect(normalizeRitaPhone('+972 50 123 4567')).toBe('972501234567');
    expect(normalizeRitaPhone('not-a-phone')).toBeNull();
    expect(ritaOutboundInputSchema.safeParse({ source: 'x'.repeat(81) }).success).toBe(false);
    expect(ritaPropertySearchSchema.safeParse({ max_price: -1 }).success).toBe(false);
  });
  it('recognizes placeholders without replacing real saved names', () => {
    expect(isPlaceholderLeadName('פנייה טלפונית')).toBe(true);
    expect(isPlaceholderLeadName('Caller 1234')).toBe(true);
    expect(isPlaceholderLeadName('ישראל ישראלי')).toBe(false);
  });
  it('accepts production and normalizes a trailing slash', () => {
    expect(normalizeRitaConfigurationOrigin('https://toraff.co.il/')).toBe('https://toraff.co.il');
    expect(normalizeRitaConfigurationOrigin('https://www.toraff.co.il')).toBe('https://www.toraff.co.il');
  });
  it('accepts both Lovable preview domain families', () => {
    expect(normalizeRitaConfigurationOrigin('https://project--e78b5aff-2ec6-4db9-b7ff-db4fe711619b-dev.lovable.app')).toBe('https://project--e78b5aff-2ec6-4db9-b7ff-db4fe711619b-dev.lovable.app');
    expect(normalizeRitaConfigurationOrigin('https://id-preview--e78b5aff-2ec6-4db9-b7ff-db4fe711619b.lovable.app/')).toBe('https://id-preview--e78b5aff-2ec6-4db9-b7ff-db4fe711619b.lovable.app');
    expect(normalizeRitaConfigurationOrigin('https://rita-preview.lovableproject.com')).toBe('https://rita-preview.lovableproject.com');
  });
  it('rejects lookalike domains, insecure URLs, credentials and paths', () => {
    for (const origin of [
      'https://toraff.co.il.evil.example',
      'https://evil-lovable.app',
      'https://lovable.app.evil.example',
      'http://project--preview-dev.lovable.app',
      'https://user@project--preview-dev.lovable.app',
      'https://project--preview-dev.lovable.app/unexpected',
    ]) {
      expect(() => normalizeRitaConfigurationOrigin(origin)).toThrow('כתובת היישום אינה מאושרת לתצורת ריטה');
    }
  });
});

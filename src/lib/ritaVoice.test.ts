import { describe, expect, it } from 'vitest';
import { buildRitaDynamicVariables, firstNameFromFullName, isPlaceholderLeadName, normalizeRitaConfigurationOrigin, normalizeRitaPhone, propertyContextFromListing, ritaOutboundInputSchema, ritaPropertySearchSchema } from './ritaVoice';

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

import { describe, expect, it } from 'vitest';
import { sameCampaignMessageContext } from './campaignMessageProperty';
import { propertyTemplateParam } from './waTemplatePersonalization';

describe('property-specific campaign content', () => {
  it('rejects output for a previously selected property', () => {
    expect(sameCampaignMessageContext({ propertyId: 'one', workspaceId: 'office' }, { propertyId: 'two', workspaceId: 'office' })).toBe(false);
    expect(sameCampaignMessageContext({ propertyId: 'one', workspaceId: 'office' }, { propertyId: 'one', workspaceId: 'office' })).toBe(true);
  });
  it('rejects output from another workspace', () => {
    expect(sameCampaignMessageContext({ propertyId: 'one', workspaceId: 'first' }, { propertyId: 'one', workspaceId: 'second' })).toBe(false);
  });
  it('binds approved property and city variables without replacing recipient identity', () => {
    const property = { property_title: 'דירה', address: 'הרצל', city: 'חיפה' };
    expect(propertyTemplateParam('property', property)).toBe('דירה · הרצל · חיפה');
    expect(propertyTemplateParam('city', property)).toBe('חיפה');
    expect(propertyTemplateParam('first_name', property)).toBeUndefined();
  });
  it('clearing selection removes prior property values', () => {
    expect(propertyTemplateParam('property', null)).toBe('[נכס]');
    expect(propertyTemplateParam('city', null)).toBe('[עיר]');
  });
});
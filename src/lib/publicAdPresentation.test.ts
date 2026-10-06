import { describe, expect, it } from 'vitest';
import { publicAdDescription, publicAdTitle } from './publicAdPresentation';

describe('public ad presentation', () => {
  it('uses Hebrew type, deal and full address', () => {
    expect(publicAdTitle({ features: { property_type: 'apartment' }, deal_type: 'sale', address: 'מבוא הקריה', house_number: '13', city: 'אשדוד' })).toBe('דירה למכירה ברחוב מבוא הקריה 13, אשדוד');
  });
  it('avoids duplicate deals and invented apartment types', () => {
    expect(publicAdTitle({ title: 'דירה להשכרה', deal_type: 'rent', street: 'הרצל 5', city: 'חיפה' })).toBe('דירה להשכרה ברחוב הרצל 5, חיפה');
    expect(publicAdTitle({ deal_type: 'sale', city: 'חיפה' })).toBe('נכס למכירה בחיפה');
  });
  it('hides empty and generated descriptions', () => {
    expect(publicAdDescription('דירה · אשדוד')).toBe('');
    expect(publicAdDescription(null)).toBe('');
    expect(publicAdDescription('דירה מוארת עם מרפסת')).toBe('דירה מוארת עם מרפסת');
  });
});
import { describe, it, expect } from 'vitest';
import { brokerFirstName, propertyExample, brokerInvitationEmailHtml, BROKER_EMAIL_BATCH_MAX } from '../../supabase/functions/_shared/brokerInvitationEmail';

describe('broker invitation email', () => {
  it('sends at most 25 per batch', () => expect(BROKER_EMAIL_BATCH_MAX).toBe(25));
  it('uses the first name only', () => expect(brokerFirstName('טל זנו')).toBe('טל'));
  it('builds property examples without house numbers', () => {
    expect(propertyExample({ address: 'באזל 12', city: 'הרצליה', deal_type: 'rent' })).toBe('הנכס להשכרה ברחוב באזל, הרצליה');
    expect(propertyExample({ address: null, city: null })).toBeNull();
  });
  it('never mentions Yad2 and always carries an unsubscribe link', () => {
    const html = brokerInvitationEmailHtml({ firstName: 'טל', examples: ['הנכס למכירה ברחוב הרצל, תל אביב'], link: 'https://toraff.co.il/auth?broker=x', unsubscribeUrl: 'https://u/x' });
    expect(html).not.toMatch(/יד ?2|yad2/i);
    expect(html).toContain('https://u/x');
    expect(html).toContain('חסכנו לך את העבודה והזנו עבורך את פרטי הנכסים');
  });
});

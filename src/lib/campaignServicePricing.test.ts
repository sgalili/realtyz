import { expect, it } from 'vitest';
import { campaignServiceEstimate, campaignServicePrice, formatCampaignCredits } from './campaignServicePricing';
const prices = [
  { action_key: 'social_post', label_he: 'יצירת פוסט', unit_he: 'פוסט', price_agorot: 8 },
  { action_key: 'sms', label_he: 'SMS', unit_he: 'הודעה', price_agorot: 4 },
  { action_key: 'whatsapp_marketing', label_he: 'WhatsApp', unit_he: 'הודעה', price_agorot: 20 },
  { action_key: 'ai_call_minute', label_he: 'IVR', unit_he: 'דקה', price_agorot: 40 },
];
it('uses configured credits per SMS send', () => expect(campaignServiceEstimate('sms', prices, 3).total).toBe(3));
it('uses the configured WhatsApp billing unit rather than inventing a window', () => expect(campaignServicePrice('whatsapp', prices)).toEqual({ credits: 5, unit: 'הודעה' }));
it('estimates IVR by minutes', () => expect(campaignServiceEstimate('ivr', prices, 3, 30).total).toBe(15));
it('fails closed when a paid price is absent', () => expect(campaignServicePrice('sms', [])).toBeNull());
it('retains fractional credit precision', () => expect(formatCampaignCredits(0.125)).toBe('0.125 קרדיטים'));
it('prices Facebook post generation at two credits', () => expect(campaignServicePrice('facebook', prices)?.credits).toBe(2));
it('prices Instagram post generation at two credits', () => expect(campaignServicePrice('instagram', prices)?.credits).toBe(2));
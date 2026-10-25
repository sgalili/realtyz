import { agorotToCredits } from '@/lib/credits';

export type CampaignPrice = { action_key: string; label_he: string; unit_he: string; price_agorot: number };
export const CAMPAIGN_ACTIONS: Record<string, string> = {
  facebook: 'social_post', instagram: 'social_post',
  sms: 'sms', whatsapp: 'whatsapp_marketing', email: 'email',
  voice: 'ai_call_minute', ivr: 'ai_call_minute', 'ai-call': 'ai_call_minute',
};
export function campaignServicePrice(channel: string, prices: CampaignPrice[]) {
  const key = CAMPAIGN_ACTIONS[channel];
  if (!key) return { credits: 0, unit: 'פוסט' };
  const row = prices.find((price) => price.action_key === key);
  if (!row || !Number.isFinite(Number(row.price_agorot))) return null;
  return { credits: agorotToCredits(Number(row.price_agorot)), unit: row.unit_he };
}
export const formatCampaignCredits = (credits: number) =>
  `${credits.toLocaleString('he-IL', { maximumFractionDigits: 6 })} קרדיטים`;
export function campaignServiceEstimate(channel: string, prices: CampaignPrice[], recipients: number, durationSeconds = 0) {
  const price = campaignServicePrice(channel, prices);
  const timed = price?.unit === 'דקה';
  const units = timed ? recipients * durationSeconds / 60 : recipients;
  return { price, units, total: price ? Number((units * price.credits).toFixed(6)) : null };
}
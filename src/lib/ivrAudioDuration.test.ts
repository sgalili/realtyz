import { expect, it } from 'vitest';
import { formatIvrDuration, ivrMaximumEstimate } from './ivrAudioDuration';

const prices = [
  { action_key: 'ai_call_minute', label_he: 'IVR', unit_he: 'דקה', price_agorot: 40 },
  { action_key: 'whatsapp_marketing', label_he: 'WA', unit_he: 'הודעה', price_agorot: 20 },
];
it('shows recording duration as MM:SS, rounding conservatively', () => {
  expect(formatIvrDuration(65.1)).toBe('01:06');
  expect(formatIvrDuration(30)).toBe('00:30');
});
it('uses the recording duration for all recipient call minutes', () => {
  expect(ivrMaximumEstimate(prices, 3, 30, false)).toBe(15);
  expect(ivrMaximumEstimate(prices, 3, 65.1, false)).toBe(33);
});
it('adds optional WhatsApp for all recipients', () => {
  expect(ivrMaximumEstimate(prices, 3, 30, true)).toBe(30);
});
it('does not invent a total when duration or configured pricing is missing', () => {
  expect(ivrMaximumEstimate(prices, 3, null, false)).toBeNull();
  expect(ivrMaximumEstimate(prices, 3, Infinity, false)).toBeNull();
  expect(ivrMaximumEstimate([], 3, 30, false)).toBeNull();
});
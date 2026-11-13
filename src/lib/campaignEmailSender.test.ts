import { expect, it } from 'vitest';
import { campaignEmailRoute } from '../../supabase/functions/_shared/campaignEmailSender';
it('honors Gmail selection even when bulk domain delivery is available', () => expect(campaignEmailRoute('gmail', true, 1, true)).toBe('gmail'));
it('honors the chosen domain alias', () => expect(campaignEmailRoute('alias', true, 1, false)).toBe('alias'));
it('never silently switches away from an unavailable selected sender', () => {
  expect(campaignEmailRoute('gmail', true, 0, false)).toBe('unavailable');
  expect(campaignEmailRoute('alias', false, 1, false)).toBe('unavailable');
});
import { describe, expect, it } from 'vitest';
import { cleanIvrScript } from '../../supabase/functions/_shared/ivrScript';

describe('IVR spoken script', () => {
  it('removes emojis without changing the selected property facts', () => {
    expect(cleanIvrScript('🏡 בית פרטי 5 חדרים\n✨ 200 מטרים, 8,500,000 שקלים.')).toBe('בית פרטי 5 חדרים 200 מטרים, 8,500,000 שקלים.');
  });
  it('does not narrate social formatting, links or licence footer', () => {
    expect(cleanIvrScript('**שלום**, בית ברמת השרון.\nרישיון תיווך: 3251767\nhttps://example.com')).toBe('שלום, בית ברמת השרון.');
  });
});
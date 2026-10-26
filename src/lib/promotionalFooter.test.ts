import { describe, expect, it, vi } from 'vitest';
import { appendPromotionalFooter, PROMOTIONAL_FOOTERS, publishedPostText } from '../../supabase/functions/_shared/promotionalFooter';
import { removeTelephoneEmojis } from '../../supabase/functions/_shared/postGeneration';

describe('published promotional footer', () => {
  it('preserves all ten exact sentences without emojis', () => {
    expect(PROMOTIONAL_FOOTERS).toEqual([
      'פורסם אוטומטית דרך TORAFF - לוח שותפים חכם',
      'נוצר ופורסם בשניות באמצעות TORAFF. הצטרפו למהפכה',
      'העסקה הבאה שלכם מתחילה ב-TORAFF | לוח נדל"ן ושיתופי פעולה',
      'מפרסמים חכם יותר, מהיר יותר. TORAFF - לוח שותפים מטורף',
      'כל הנכסים, כל השותפים, במקום אחד. TORAFF',
      'פורסם דרך מערכת TORAFF לניהול נכסים ושיווק אוטומטי',
      'סוגרים עסקאות נדל"ן בקלות עם TORAFF - לוח השותפים המוביל',
      'מפיצים קמפיינים חכם ומהיר. TORAFF - לוח שותפים מטורף',
      'הדרך המתקדמת ביותר לשיווק נכסים. TORAFF',
      'שותפים להצלחה שלך בנדל"ן. TORAFF - לוח שותפים',
    ]);
  });
  it('replaces an existing footer and keeps the assigned footer last', () => {
    expect(appendPromotionalFooter(`🏡 דירה\nhttps://toraff.co.il/r/test\n\n${PROMOTIONAL_FOOTERS[4]}`, 0)).toBe(`🏡 דירה\nhttps://toraff.co.il/r/test\n\n${PROMOTIONAL_FOOTERS[0]}`);
  });
  it('removes telephone emojis without removing property emojis or facts', () => {
    expect(removeTelephoneEmojis('🏡 דירה\n📞 ☎️ 📱 📲 050-1234567')).toBe('🏡 דירה\n    050-1234567');
  });
  it('reserves room for the footer within Instagram limits', () => {
    const text = appendPromotionalFooter('א'.repeat(2200), 9, 2200);
    expect(text.length).toBe(2200);
    expect(text.endsWith(PROMOTIONAL_FOOTERS[9])).toBe(true);
  });
  it('uses the same persisted publication identity on retries and fails closed', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    const first = await publishedPostText({ rpc }, 'ws', 'group:123', 'דירה');
    expect(await publishedPostText({ rpc }, 'ws', 'group:123', 'דירה')).toBe(first);
    expect(rpc).toHaveBeenLastCalledWith('claim_published_post_footer', { _workspace: 'ws', _publication_key: 'group:123' });
    rpc.mockResolvedValue({ data: null, error: new Error('unavailable') });
    await expect(publishedPostText({ rpc }, 'ws', 'group:124', 'דירה')).rejects.toThrow();
  });
});
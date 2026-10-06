import { describe, expect, it } from 'vitest';
import { capturedInquiryName, validScreeningEvidence } from '../../supabase/functions/_shared/listingInquiryEvidence';
import { deriveContactOptions } from './leadTiers';

describe('priced listing inquiries', () => {
  it('retains the form price flag alongside conversation prices', () => {
    expect(deriveContactOptions({ tier1: 20, tier2: 40, tier3: 60, questions: [], questionsPhone: [] })).toMatchObject({ digital: true, whatsapp: true, phone: true });
    expect(deriveContactOptions({ tier1: 20, tier2: 0, tier3: 0, questions: [], questionsPhone: [] })).toMatchObject({ digital: true, whatsapp: false, phone: false });
  });
  it('gets a name from the visitor, not an assistant or greeting', () => {
    expect(capturedInquiryName([{ role: 'assistant', content: 'שמי ריטה' }, { role: 'user', content: 'שלום' }])).toBeNull();
    expect(capturedInquiryName([{ role: 'assistant', content: 'מה השם המלא שלך?' }, { role: 'user', content: 'ישראל ישראלי' }])).toBe('ישראל ישראלי');
    expect(capturedInquiryName([{ role: 'user', content: 'קוראים לי ישראל ישראלי' }])).toBe('ישראל ישראלי');
  });
  it('rejects invented answers and accepts partial evidence without qualifying blanks', () => {
    const questions = ['תקציב?', 'מתי?', 'מימון?'];
    expect(validScreeningEvidence(questions, [{ answer: 'מיליון', satisfactory: true }, { answer: '', satisfactory: false }, { answer: '', satisfactory: false }], 'מיליון')).toBe(true);
    expect(validScreeningEvidence(questions, [{ answer: 'מיליון', satisfactory: true }, { answer: 'מחר', satisfactory: true }, { answer: 'כן', satisfactory: true }], 'מיליון')).toBe(false);
    expect(validScreeningEvidence(questions, [{ answer: '', satisfactory: true }, { answer: '', satisfactory: false }, { answer: '', satisfactory: false }], '')).toBe(false);
  });
});
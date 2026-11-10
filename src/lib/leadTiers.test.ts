import { describe, expect, it } from 'vitest';
import { resolveLeadQuestions } from './leadTiers';

describe('lead filtering defaults', () => {
  it.each(['whatsapp', 'phone'])('provides three sale questions for an unconfigured %s card', () => {
    expect(resolveLeadQuestions(undefined, 'sale')).toEqual(['מה התקציב שלכם לרכישה?', 'האם יש לכם אישור עקרוני למשכנתה?', 'מתי תרצו להיכנס לנכס?']);
  });
  it('provides three relevant rental questions', () => {
    expect(resolveLeadQuestions(undefined, 'rent')).toEqual(['מתי תרצו להיכנס לנכס?', 'מה התקציב החודשי שלכם?', 'כמה נפשות יגורו בנכס?']);
  });
  it('preserves explicitly removed questions', () => {
    expect(resolveLeadQuestions([], 'sale')).toEqual([]);
  });
});
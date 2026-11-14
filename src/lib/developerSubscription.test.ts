import { describe, expect, it } from 'vitest';
import { developerEntitlementActive, developerPlanQuote } from '../../supabase/functions/_shared/developerSubscription';

describe('developer monthly plan', () => {
  it('charges ₪9,500 plus exactly 18% VAT for the first month', () => {
    const quote = developerPlanQuote();
    expect(quote.baseAmountIls).toBe(9500);
    expect(quote.vatAmountIls).toBe(1710);
    expect(quote.totalAmountIls).toBe(11210);
  });

  it('keeps the grey regular price at ₪13,000 and grants thirty days', () => {
    const quote = developerPlanQuote();
    expect(quote.regularAmountIls).toBe(13000);
    expect(quote.durationDays).toBe(30);
  });

  it('includes AI and unlimited publishing without bundling external campaign credits', () => {
    const quote = developerPlanQuote();
    expect(quote.benefits).toContain('ללא הגבלה');
    expect(quote.benefits).toContain('ה-AI כלולות');
    expect(quote.benefits).toContain('קמפיינים חיצוניים');
    expect(quote.benefits).toContain('קרדיטים נוספים');
  });

  it('accepts only a current developer entitlement', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    expect(developerEntitlementActive({ plan_code: 'developer_monthly', starts_at: '2026-11-01T00:00:00Z', expires_at: '2026-12-01T00:00:00Z' }, now)).toBe(true);
    expect(developerEntitlementActive({ plan_code: 'developer_monthly', starts_at: '2026-11-01T00:00:00Z', expires_at: '2026-11-14T12:00:00Z' }, now)).toBe(false);
    expect(developerEntitlementActive({ plan_code: null, starts_at: '2026-11-01T00:00:00Z', expires_at: '2026-12-01T00:00:00Z' }, now)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { listingToDraft, draftPricingPayload, preserveListingFeatures, missingPublishFields } from './adRecovery';
import { EMPTY_PUBLIC_LISTING_DRAFT } from './publicListingDraft';

const fields = [{ id: 'storage', label: 'אחסון אופניים', type: 'yesno', required: true }];
const row = {
  id: 'saved', deal_type: 'sale', affiliate_tier1_amount: 100, affiliate_tier2_amount: 200, affiliate_tier3_amount: 300,
  features: { deal_closing_commission: { type: 'percent', value: 1.2 }, lead_daily_limits: { form: 9 } },
  contact_options: { lead_daily_limits: { form: 5, whatsapp: 3, phone: 2 }, questions: ['תקציב?'], questions_phone: [], form_fields: fields, custom_flag: true },
};
describe('saved ad recovery', () => {
  it('requires explicit owner declaration for private publication, including legacy drafts', () => {
    const draft = { ...EMPTY_PUBLIC_LISTING_DRAFT, publisherType: 'private' as const };
    expect(missingPublishFields({ ...draft, ownerDeclarationAccepted: undefined }, true)).toContain('הצהרת בעלות והרשאה');
    expect(missingPublishFields({ ...draft, ownerDeclarationAccepted: false }, true)).toContain('הצהרת בעלות והרשאה');
    expect(missingPublishFields({ ...draft, ownerDeclarationAccepted: true }, true)).not.toContain('הצהרת בעלות והרשאה');
  });
  it('keeps broker and developer publication exempt from the non-broker declaration', () => {
    for (const publisherType of ['broker', 'developer'] as const) {
      expect(missingPublishFields({ ...EMPTY_PUBLIC_LISTING_DRAFT, publisherType }, true)).not.toContain('הצהרת בעלות והרשאה');
    }
  });
  it('does not replace terms or commission consent with the owner declaration', () => {
    expect(missingPublishFields({ ...EMPTY_PUBLIC_LISTING_DRAFT, publisherType: 'private', ownerDeclarationAccepted: true }, true)).toEqual(expect.arrayContaining(['אישור התקנון', 'אישור מנגנון העמלות']));
  });
  it('disabling only the form fee saves zero while retaining fields, questions and other fees', () => {
    const draft = { ...listingToDraft(row), commissionForm: '' };
    const saved = draftPricingPayload(draft, row.contact_options);
    expect(saved.affiliate_tier1_amount).toBe(0);
    expect(saved.affiliate_tier2_amount).toBe(200);
    expect(saved.contact_options.digital).toBe(false);
    expect(saved.contact_options.form_fields[0].label).toBe('אחסון אופניים');
    expect(saved.contact_options.questions).toEqual(['תקציב?']);
  });
  it('recovers selected amenity counts and types', () => {
    expect(listingToDraft({ features: { elevator_count: '3+', parking_count: '2', balcony_types: ['מרפסת שמש', 'מרפסת שירות'], view_type: 'נוף לים' } })).toMatchObject({ elevatorCount: '3+', parkingCount: '2', balconyTypes: ['מרפסת שמש', 'מרפסת שירות'], viewType: 'נוף לים' });
  });
  it('recovers immediate entry without converting it to a date', () => {
    expect(listingToDraft({ features: { entry_date: 'מיידית' } }).entryDate).toBe('מיידית');
  });
  it('keeps the entry-date mode separate from the chosen date', () => {
    expect(listingToDraft({ features: { entry_date: 'מיידית' } }).entryMode).toBe('immediate');
    expect(listingToDraft({ features: { entry_date: '2026-08-01' } }).entryMode).toBe('date');
    expect(listingToDraft({ features: {} }).entryMode).toBe('');
  });
  it('does not require property condition or air direction for publication', () => {
    const draft = { ...EMPTY_PUBLIC_LISTING_DRAFT, price: '2000000', commissionDeal: '1' };
    expect(missingPublishFields(draft, true)).not.toContain('מצב הנכס');
    expect(missingPublishFields(draft, true)).not.toContain('כיווני אוויר');
  });
  it('requires a positive property price before publication', () => {
    expect(missingPublishFields({ ...EMPTY_PUBLIC_LISTING_DRAFT, price: '0', commissionDeal: '1' }, true)).toContain('מחיר');
    expect(missingPublishFields({ ...EMPTY_PUBLIC_LISTING_DRAFT, price: '2000000', commissionDeal: '1' }, true)).not.toContain('מחיר');
  });
  it('requires closing commission even when other lead types are priced', () => {
    expect(missingPublishFields({ ...EMPTY_PUBLIC_LISTING_DRAFT, commissionForm: '40', commissionDeal: '' }, true)).toContain('עמלת סגירה');
    expect(missingPublishFields({ ...EMPTY_PUBLIC_LISTING_DRAFT, commissionDeal: '1' }, true)).not.toContain('עמלת סגירה');
  });
  it('allows all optional lead prices to remain disabled with a configured closing fee', () => {
    const draft = { ...EMPTY_PUBLIC_LISTING_DRAFT, commissionForm: '', commissionWhatsapp: '', commissionPhone: '', commissionDeal: '1' };
    expect(missingPublishFields(draft, true)).not.toContain('עמלה לפחות לסוג פנייה אחד');
    expect(draftPricingPayload(draft)).toMatchObject({ affiliate_tier1_amount: 0, affiliate_tier2_amount: 0, affiliate_tier3_amount: 0, affiliate_tier4_type: 'percent', affiliate_tier4_amount: 1 });
  });
  it('preserves the saved closing fee and type', () => {
    expect(draftPricingPayload(listingToDraft(row)).features.deal_closing_commission).toEqual({ type: 'percent', value: 1.2 });
  });
  it.each([['sale', 'fixed', 10000], ['sale', 'percent', 0.2], ['rent', 'fixed', 600], ['rent', 'percent', 100]])('round-trips %s %s closing fees without conversion', (deal, type, value) => {
    const saved = { ...row, deal_type: deal, features: { deal_closing_commission: { type, value } } };
    expect(draftPricingPayload(listingToDraft(saved)).features.deal_closing_commission).toEqual({ type, value });
  });
  it('round-trips each individual daily cap without using the legacy global cap', () => {
    expect(draftPricingPayload(listingToDraft({ ...row, daily_lead_cap: 999 })).contact_options.lead_daily_limits).toEqual({ form: 5, whatsapp: 3, phone: 2 });
  });
  it('preserves questions including explicitly empty phone questions', () => {
    const options = draftPricingPayload(listingToDraft(row)).contact_options;
    expect(options.questions).toEqual(['תקציב?']); expect(options.questions_phone).toEqual([]);
  });
  it('preserves custom fields and unrelated contact settings on save', () => {
    const options = draftPricingPayload(listingToDraft(row), row.contact_options).contact_options;
    expect(options.form_fields).toEqual([{ ...fields[0], options: [] }]); expect(options).toMatchObject({ custom_flag: true });
  });
  it('uses legacy feature-backed fees, limits and questions', () => {
    const draft = listingToDraft({ ...row, contact_options: null, features: { deal_closing_commission: { type: 'fixed', value: 600 }, lead_daily_limits: { form: 7 }, screening_questions: { whatsapp: ['מתי?'], phone: ['מי?'] } } });
    expect(draft.commissionDeal).toBe('600'); expect(draft.commissionDealType).toBe('fixed'); expect(draft.limitForm).toBe('7'); expect(draft.questionsPhone).toEqual(['מי?']);
  });
  it('preserves feature metadata during unrelated legacy detail edits', () => {
    expect(preserveListingFeatures(row.features, ['מעלית'])).toEqual({ ...row.features, amenity_labels: ['מעלית'] });
    expect(preserveListingFeatures(['ישן', row.features], ['חדש'])).toEqual(['חדש', row.features]);
  });
});
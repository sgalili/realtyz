import { describe, expect, it } from 'vitest';
import { BROKERS_ONLY_FAQS, GENERAL_FAQS, ROLE_FAQS, faqPresentation, type FaqRoleKey } from './faqData';

describe('FAQ platform mode selection', () => {
  it('uses broker-only questions for unauthenticated visitors', () => {
    expect(faqPresentation(true, null).generalFaqs).toBe(BROKERS_ONLY_FAQS);
  });
  it.each<FaqRoleKey>(['broker', 'developer', 'affiliate', 'private'])('does not expose marketplace role questions for %s in broker-only mode', role => {
    expect(faqPresentation(true, role).roleFaqs).toBeNull();
  });
  it.each<FaqRoleKey>(['broker', 'developer', 'affiliate', 'private'])('retains the original %s FAQ data in full-marketplace', role => {
    expect(faqPresentation(false, role).generalFaqs).toBe(GENERAL_FAQS);
    expect(faqPresentation(false, role).roleFaqs).toBe(ROLE_FAQS[role]);
  });
});
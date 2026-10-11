import { afterEach, describe, expect, it } from 'vitest';
import { completePartnerIntro, consumePartnerIntroCompletion, partnerIntroDismissed } from './partnerIntroPreference';
afterEach(() => localStorage.clear());
describe('partner introduction preferences', () => {
  it('remembers only the requesting user and consumes completion once', () => {
    completePartnerIntro('a', true);
    expect(partnerIntroDismissed('a')).toBe(true);
    expect(partnerIntroDismissed('b')).toBe(false);
    expect(consumePartnerIntroCompletion('a')).toBe(true);
    expect(consumePartnerIntroCompletion('a')).toBe(false);
  });
  it('shows again next visit when Dont show again is unchecked', () => {
    completePartnerIntro('c', false);
    expect(partnerIntroDismissed('c')).toBe(false);
    expect(consumePartnerIntroCompletion('c')).toBe(true);
  });
});
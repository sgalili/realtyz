import { describe, expect, it } from 'vitest';
import { visibleToListingAudience } from './listingAudience';

const closingOnly = { form: false, whatsapp: false, phone: false, closing: true };
describe('closing-only listing audience', () => {
  it('hides zero lead commission properties from signed-in non-brokers', () => {
    expect(visibleToListingAudience(closingOnly, true, false)).toBe(false);
  });
  it('keeps them visible to server-verified brokers', () => {
    expect(visibleToListingAudience(closingOnly, true, true)).toBe(true);
  });
  it('keeps guest browsing unchanged', () => {
    expect(visibleToListingAudience(closingOnly, false, false)).toBe(true);
  });
  it.each(['form', 'whatsapp', 'phone'] as const)('keeps properties offering %s rewards', tier => {
    expect(visibleToListingAudience({ ...closingOnly, [tier]: true }, true, false)).toBe(true);
  });
  it('does not infer zero from absent or redacted rewards', () => {
    expect(visibleToListingAudience(undefined, true, false)).toBe(true);
    expect(visibleToListingAudience({ closing: true }, true, false)).toBe(true);
  });
  it('keeps properties without a closing reward', () => {
    expect(visibleToListingAudience({ ...closingOnly, closing: false }, true, false)).toBe(true);
  });
});
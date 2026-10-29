import { describe, expect, it } from 'vitest';
import { visibleToListingAudience } from './listingAudience';

const closingOnly = { closing: true, form: false, whatsapp: false, phone: false };
describe('closing-only listing audience', () => {
  it('hides closing-only listings from signed-in non-brokers', () => {
    expect(visibleToListingAudience(closingOnly, true, false)).toBe(false);
  });
  it('shows closing-only listings to verified brokers', () => {
    expect(visibleToListingAudience(closingOnly, true, true)).toBe(true);
  });
  it('shows closing-only listings to guests', () => {
    expect(visibleToListingAudience(closingOnly, false, false)).toBe(true);
  });
  it('keeps listings with unknown rewards visible', () => {
    expect(visibleToListingAudience({ closing: true }, true, false)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { isUnavailableListingError, listingDetailIdentifier } from './publicListingLookup';

describe('public listing lookup identity', () => {
  it('uses the exact saved UUID instead of an obsolete owner slug', () => {
    expect(listingDetailIdentifier({ id: '5f49594d-c6fb-4f93-a429-945ee100bd58', slug: 'owner-f12db948-muy74wge' })).toBe('5f49594d-c6fb-4f93-a429-945ee100bd58');
  });
  it('treats a 404 as unavailable without turning authorization or network failures into absence', () => {
    expect(isUnavailableListingError({ context: new Response(null, { status: 404 }) })).toBe(true);
    expect(isUnavailableListingError({ context: new Response(null, { status: 403 }) })).toBe(false);
    expect(isUnavailableListingError(new Error('network'))).toBe(false);
  });
});
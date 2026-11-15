import { describe, expect, it } from 'vitest';
import { identityPath } from './PublicIdentityLink';

describe('identityPath', () => {
  it('opens the office page when the office has more than one broker', () => {
    expect(identityPath('u1', 2)).toBe('/community/office/u1');
  });
  it('opens the broker profile for a single-broker office', () => {
    expect(identityPath('u1', 1)).toBe('/community/profile/u1');
  });
  it('opens the broker profile for an independent broker without an office', () => {
    expect(identityPath('u1', 0)).toBe('/community/profile/u1');
  });
});

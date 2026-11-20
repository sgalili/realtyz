import { describe, expect, it } from 'vitest';
import { canManageListing, canOpenPropertyManagement } from './propertyMenuPolicy';

describe('property management menu policy', () => {
  it('gives Super Admin the full management menu for a non-owned listing', () => {
    expect(canManageListing(false, true)).toBe(true);
  });
  it('keeps the full management menu for the listing owner', () => {
    expect(canManageListing(true, false)).toBe(true);
  });
  it('keeps other viewers on the viewer-safe menu', () => {
    expect(canManageListing(false, false)).toBe(false);
  });
  it('lets Super Admin open full property editing without broker workspace access', () => {
    expect(canOpenPropertyManagement(false, true)).toBe(true);
  });
  it('keeps full property editing closed to viewers without property access', () => {
    expect(canOpenPropertyManagement(false, false)).toBe(false);
  });
});

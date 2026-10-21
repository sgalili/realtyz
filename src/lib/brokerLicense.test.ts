import { describe, it, expect, vi } from 'vitest';
import { BROKER_LICENSE_PATTERN, exactRegistryRecord, registrySourceIsFresh } from '../../supabase/functions/_shared/brokerRegistry';

describe('official broker license validation', () => {
  it('requires a numeric positive license number, without assuming a fixed length', () => {
    expect(BROKER_LICENSE_PATTERN.test('')).toBe(false);
    expect(BROKER_LICENSE_PATTERN.test('123A')).toBe(false);
    expect(BROKER_LICENSE_PATTERN.test('30722789')).toBe(true);
    expect(BROKER_LICENSE_PATTERN.test('313375')).toBe(true);
    expect(BROKER_LICENSE_PATTERN.test('12345678901')).toBe(false);
  });
  it('requires an exact official license match, not a partial match or name match', () => {
    const rows = [{ 'מס רשיון': 30722789, 'שם המתווך': 'בן דוד דניאל' }];
    expect(exactRegistryRecord(rows, '30722789')).toEqual(rows[0]);
    expect(exactRegistryRecord(rows, '3072278')).toBeUndefined();
  });
  it('rejects malformed official evidence without a holder', () => {
    expect(exactRegistryRecord([{ 'מס רשיון': 30722789 }], '30722789')).toBeUndefined();
  });
  it('fails closed for stale or prior-year registry data', () => {
    const now = new Date('2026-10-21T01:09:00Z');
    expect(registrySourceIsFresh('2026-10-20T16:13:38Z', now)).toBe(true);
    expect(registrySourceIsFresh('2026-10-01T16:13:38Z', now)).toBe(false);
    expect(registrySourceIsFresh('2025-12-31T16:13:38Z', new Date('2026-01-01T00:00:00Z'))).toBe(false);
    expect(registrySourceIsFresh('invalid', now)).toBe(false);
  });
});
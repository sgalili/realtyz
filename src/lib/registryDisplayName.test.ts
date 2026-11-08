import { describe, expect, it } from 'vitest';
import { registryDisplayName } from '../../supabase/functions/_shared/brokerRegistry';
describe('official surname-first display names', () => {
  it('displays license 31927721 holder given name first', () => {
    expect(registryDisplayName('אידלסון דולי')).toBe('דולי אידלסון');
  });
  it('preserves matched first-name-first compound surnames', () => {
    expect(registryDisplayName('בן דוד דניאל', 'דניאל בן דוד')).toBe('דניאל בן דוד');
  });
  it('never accepts an unrelated account identity', () => {
    expect(registryDisplayName('אידלסון דולי', 'שי גלילי')).toBe('דולי אידלסון');
  });
  it('preserves one-part names without inventing surname', () => {
    expect(registryDisplayName('דולי')).toBe('דולי');
  });
});
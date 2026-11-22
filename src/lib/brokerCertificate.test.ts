import { describe, expect, it } from 'vitest';
import { certificateNameMatches, certificateRegistryResponse } from '../../supabase/functions/_shared/brokerCertificate';

describe('exact certificate-to-registry names', () => {
  it('returns an unverified HTTP 200 result when the certificate license has no registry match', () => {
    const result = certificateRegistryResponse('318317', 'ישראל ישראלי', null);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ matched: false, code: 'license_not_found', registryName: null, licenseNumber: '318317' });
  });
  it('returns a failed comparison without a request failure for a name mismatch', () => {
    const result = certificateRegistryResponse('318317', 'ישראל ישראלי', 'ישראלי ישראל');
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ matched: false, code: 'name_mismatch' });
  });
  it('marks matched only when the certificate exactly matches an existing registry name', () => {
    expect(certificateRegistryResponse('318317', 'ישראל ישראלי', 'ישראל ישראלי').body).toMatchObject({ matched: true, code: 'matched' });
  });
  it('accepts identical full names', () => expect(certificateNameMatches('ישראל ישראלי', 'ישראל ישראלי')).toBe(true));
  it('rejects one-letter differences', () => expect(certificateNameMatches('ישראל ישראלי', 'ישראל ישראליי')).toBe(false));
  it('rejects reordered names', () => expect(certificateNameMatches('ישראלי ישראל', 'ישראל ישראלי')).toBe(false));
  it('rejects missing surnames', () => expect(certificateNameMatches('ישראל', 'ישראל ישראלי')).toBe(false));
  it('does not normalize punctuation', () => expect(certificateNameMatches('ישראל בן-דוד', 'ישראל בן דוד')).toBe(false));
  it('rejects empty names', () => expect(certificateNameMatches(' ', ' ')).toBe(false));
});
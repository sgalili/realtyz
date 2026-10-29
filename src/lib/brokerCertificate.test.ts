import { describe, expect, it } from 'vitest';
import { certificateNameMatches } from '../../supabase/functions/_shared/brokerCertificate';

describe('exact certificate-to-registry names', () => {
  it('accepts identical full names', () => expect(certificateNameMatches('ישראל ישראלי', 'ישראל ישראלי')).toBe(true));
  it('rejects one-letter differences', () => expect(certificateNameMatches('ישראל ישראלי', 'ישראל ישראליי')).toBe(false));
  it('rejects reordered names', () => expect(certificateNameMatches('ישראלי ישראל', 'ישראל ישראלי')).toBe(false));
  it('rejects missing surnames', () => expect(certificateNameMatches('ישראל', 'ישראל ישראלי')).toBe(false));
  it('does not normalize punctuation', () => expect(certificateNameMatches('ישראל בן-דוד', 'ישראל בן דוד')).toBe(false));
  it('rejects empty names', () => expect(certificateNameMatches(' ', ' ')).toBe(false));
});
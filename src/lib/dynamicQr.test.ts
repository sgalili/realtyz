import { describe, expect, it } from 'vitest';
import { DEFAULT_DYNAMIC_QR_DESTINATION, dynamicQrPublicUrl, normalizeDynamicQrDestination, safeDynamicQrDestination } from './dynamicQr';

describe('dynamic QR destinations', () => {
  it('always points the printed QR to the canonical fixed redirect', () => {
    expect(dynamicQrPublicUrl()).toBe('https://toraff.co.il/go');
  });
  it('accepts a complete HTTPS destination', () => {
    expect(normalizeDynamicQrDestination(' https://example.com/landing?source=qr ')).toBe('https://example.com/landing?source=qr');
  });
  it('gives multiple codes distinct permanent URLs', () => {
    expect(dynamicQrPublicUrl('code-one')).toBe('https://toraff.co.il/go/code-one');
    expect(dynamicQrPublicUrl('code-two')).toBe('https://toraff.co.il/go/code-two');
  });
  it('prevents custom codes redirecting into another QR route', () => {
    expect(() => normalizeDynamicQrDestination('https://toraff.co.il/go/code-one')).toThrow();
    expect(() => normalizeDynamicQrDestination('https://www.toraff.co.il/go/code-two')).toThrow();
  });
  it('rejects non-web schemes and URLs with credentials', () => {
    expect(() => normalizeDynamicQrDestination('javascript:alert(1)')).toThrow();
    expect(() => normalizeDynamicQrDestination('https://user:secret@example.com')).toThrow();
  });
  it('rejects a redirect loop and falls back safely', () => {
    expect(() => normalizeDynamicQrDestination('https://toraff.co.il/go?campaign=print')).toThrow();
    expect(safeDynamicQrDestination('https://toraff.co.il/go')).toBe(DEFAULT_DYNAMIC_QR_DESTINATION);
    expect(safeDynamicQrDestination(null)).toBe(DEFAULT_DYNAMIC_QR_DESTINATION);
  });
});

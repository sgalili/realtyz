import { describe, expect, it } from 'vitest';
import { PLATFORM_PRESENTATION, platformPresentation, platformPageMetadata } from './platformPresentation';
import { publicProfileShare } from './publicProfileShare';

describe('platform presentation selection', () => {
  it('selects the broker configuration while mode is unresolved', () => {
    expect(platformPresentation()).toBe(PLATFORM_PRESENTATION.brokers_only);
  });
  it('restores the retained marketplace configuration and can switch back', () => {
    expect(platformPresentation('full_marketplace')).toBe(PLATFORM_PRESENTATION.full_marketplace);
    expect(platformPresentation('brokers_only')).toBe(PLATFORM_PRESENTATION.brokers_only);
  });
  it('keeps canonical identity on the requested custom-domain route in both modes', () => {
    for (const mode of ['brokers_only', 'full_marketplace'] as const) {
      expect(platformPageMetadata(mode, '/signatures').canonical).toBe('https://toraff.co.il/signatures');
      expect(platformPageMetadata(mode, '/').canonical).toBe('https://toraff.co.il/');
      expect(platformPageMetadata(mode, '/properties', '/demo/broker/properties').canonical).toBe('https://toraff.co.il/demo/broker/properties');
    }
  });
  it('preserves the same shared profile destination across modes and channels', () => {
    const broker = publicProfileShare('/community/profile/test', 'TORAFF', 'brokers_only');
    const marketplace = publicProfileShare('/community/profile/test', 'TORAFF', 'full_marketplace');
    expect(broker.url).toBe(marketplace.url);
    for (const details of [broker, marketplace]) {
      expect(decodeURIComponent(details.sms)).toContain(details.url);
      expect(decodeURIComponent(details.email)).toContain(details.url);
      expect(decodeURIComponent(details.whatsapp)).toContain(details.url);
    }
  });
});
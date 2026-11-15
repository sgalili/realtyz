import { describe, expect, it } from 'vitest';
import { publicProfileShare, useNativeProfileShare } from './publicProfileShare';

describe('publicProfileShare', () => {
  it('uses sharing options on desktop even in a narrow window', () => {
    expect(useNativeProfileShare(true, false, true)).toBe(false);
    expect(useNativeProfileShare(false, false, true)).toBe(false);
  });

  it('allows native sharing on touch phones only when available', () => {
    expect(useNativeProfileShare(true, true, true)).toBe(true);
    expect(useNativeProfileShare(true, true, false)).toBe(false);
  });

  const share = publicProfileShare('/broker/user%201', 'דולי אידלסון');

  it('uses the canonical public profile URL for copying and native sharing', () => {
    expect(share.url).toBe('https://toraff.co.il/broker/user%201');
    expect(share).toMatchObject({ title: 'דולי אידלסון', text: 'דולי אידלסון ב־TORAFF' });
  });

  it('builds WhatsApp, SMS and email sharing links with the profile details', () => {
    const message = 'דולי אידלסון ב־TORAFF\nhttps://toraff.co.il/broker/user%201';
    expect(share.whatsapp).toBe(`https://wa.me/?text=${encodeURIComponent(message)}`);
    expect(share.sms).toBe(`sms:?&body=${encodeURIComponent(message)}`);
    expect(share.email).toBe(`mailto:?subject=${encodeURIComponent('דולי אידלסון')}&body=${encodeURIComponent(message)}`);
  });
});

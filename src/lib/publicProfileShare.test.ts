import { describe, expect, it } from 'vitest';
import { publicProfileShare } from './publicProfileShare';

describe('publicProfileShare', () => {
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

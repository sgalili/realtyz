import { describe, expect, it } from 'vitest';
import { cleanRotatingMessageText, resolveRotatingMessageAudience, validRotatingMessageText } from './rotatingMessages';

describe('rotating message audiences', () => {
  it('uses guest messages only for signed-out visitors', () => {
    expect(resolveRotatingMessageAudience({ signedIn: false, roles: [], partnerMode: false })).toBe('guest');
  });

  it('uses broker and partner messages for explicit partner mode', () => {
    expect(resolveRotatingMessageAudience({ signedIn: true, roles: ['developer', 'affiliate'], partnerMode: true })).toBe('broker_partner');
    expect(resolveRotatingMessageAudience({ signedIn: true, roles: ['managing_broker'], partnerMode: false })).toBe('broker_partner');
  });

  it('uses developer messages for the primary developer role', () => {
    expect(resolveRotatingMessageAudience({ signedIn: true, roles: ['developer'], partnerMode: false })).toBe('developer');
  });

  it('uses private messages for owners, buyers, sellers and renters', () => {
    expect(resolveRotatingMessageAudience({ signedIn: true, roles: ['property_owner'], partnerMode: false })).toBe('private');
    expect(resolveRotatingMessageAudience({ signedIn: true, roles: ['property_seeker'], partnerMode: false })).toBe('private');
  });
});

describe('rotating message validation', () => {
  it('trims and normalizes whitespace before saving', () => {
    expect(cleanRotatingMessageText('  שלום   לכולם  ')).toBe('שלום לכולם');
  });

  it('rejects empty and overlong messages', () => {
    expect(validRotatingMessageText('   ')).toBe(false);
    expect(validRotatingMessageText('א'.repeat(241))).toBe(false);
    expect(validRotatingMessageText('מסר תקין')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { brokerVisitorEntryLinks, visitorChatScope, visitorLiveTokenKey } from './visitorChatScope';

describe('visitor presentation isolation', () => {
  it('does not reuse marketplace conversation state in brokers-only', () => {
    expect(visitorChatScope('brokers_only')).not.toBe(visitorChatScope('full_marketplace'));
  });
  it('retains the existing marketplace storage identity', () => {
    expect(visitorChatScope('full_marketplace')).toBe('toraff-visitor-rita-history');
  });
  it('keeps broker live replies separate from marketplace replies', () => {
    expect(visitorLiveTokenKey(visitorChatScope('brokers_only'))).not.toBe(visitorLiveTokenKey(visitorChatScope('full_marketplace')));
  });
  it('preserves the original live-session identity for other chat callers', () => {
    expect(visitorLiveTokenKey()).toBe('toraff-rita-live-token');
  });
  it.each(['/auth?mode=signup', '/auth?mode=login', '/demo/broker/properties'])('resolves the approved entry destination %s on the public domain', path => {
    expect(brokerVisitorEntryLinks(`[כניסה](${path})`)).toBe(`[כניסה](https://toraff.co.il${path})`);
  });
  it('does not widen the entry allowlist to other paths or external URLs', () => {
    const text = '[ניהול](/super-admin) [חיצוני](https://example.com) [דמו](/demo/broker/properties?next=/super-admin)';
    expect(brokerVisitorEntryLinks(text)).toBe(text);
  });
});
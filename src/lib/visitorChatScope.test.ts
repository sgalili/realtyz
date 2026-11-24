import { describe, expect, it } from 'vitest';
import { visitorChatScope, visitorLiveTokenKey } from './visitorChatScope';

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
});
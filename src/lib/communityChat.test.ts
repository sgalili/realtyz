import { describe, expect, it } from 'vitest';
import { communityMessageContent, communityPeerId } from './communityChat';

describe('community conversations', () => {
  it('keeps peer conversations separate from unrelated participants', () => {
    const message = { sender_id: 'agent', recipient_id: 'developer' };
    expect(communityPeerId(message, 'agent')).toBe('developer');
    expect(communityPeerId(message, 'developer')).toBe('agent');
    expect(communityPeerId(message, 'other')).toBeNull();
  });
  it('requires a non-empty bounded message before sending', () => {
    expect(communityMessageContent('  ')).toBeNull();
    expect(communityMessageContent(' שלום ')).toBe('שלום');
    expect(communityMessageContent('א'.repeat(4000))).toHaveLength(4000);
    expect(communityMessageContent('א'.repeat(4001))).toBeNull();
  });
});
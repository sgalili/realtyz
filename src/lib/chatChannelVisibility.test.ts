import { describe, expect, it } from 'vitest';
import { channelVisible } from './chatChannelVisibility';
describe('chat channel visibility', () => {
  it('shows every channel by default', () => {
    expect(channelVisible('whatsapp', new Set())).toBe(true);
    expect(channelVisible('facebook', new Set())).toBe(true);
  });
  it('hides only disabled channels including when all are disabled', () => {
    expect(channelVisible('WhatsApp', new Set(['whatsapp']))).toBe(false);
    expect(channelVisible('facebook', new Set(['whatsapp']))).toBe(true);
    expect(channelVisible('facebook', new Set(['whatsapp', 'facebook']))).toBe(false);
  });
});
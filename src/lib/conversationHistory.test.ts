import { describe, expect, it } from 'vitest';
import { conversationHistory } from '../../supabase/functions/rita-conversation/history';

describe('Rita conversation history', () => {
  it('retains prior authorized Rita turns and orders them with chat messages', () => {
    const history = conversationHistory([{ content: 'Later message', created_at: '2026-11-11T20:00:00Z' }], [{ prompt: 'Four rooms', response: 'Which city?', created_at: '2026-11-11T19:00:00Z' }]);
    expect(history).toContain('Four rooms');
    expect(history).toContain('Which city?');
    expect(history.indexOf('Which city?')).toBeLessThan(history.indexOf('Later message'));
  });
});
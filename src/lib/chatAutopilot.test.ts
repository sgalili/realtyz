import { expect, it } from 'vitest';
import { activeChatAutopilot } from './chatAutopilot';
it('Rita includes only globally enabled chats whose per-chat autopilot is enabled', () => {
  const chats = [{ id: 'on', ai_autopilot: true }, { id: 'off', ai_autopilot: false }, { id: 'default', ai_autopilot: null }, { id: 'phone:972500000000', ai_autopilot: true }];
  expect(chats.filter(chat => activeChatAutopilot(chat, true)).map(chat => chat.id)).toEqual(['on', 'default']);
  expect(chats.filter(chat => activeChatAutopilot(chat, false))).toEqual([]);
});
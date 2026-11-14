export function activeChatAutopilot(chat: { id: string; ai_autopilot?: boolean | null }, globalEnabled: boolean): boolean {
  return globalEnabled && !chat.id.startsWith('phone:') && chat.ai_autopilot !== false;
}
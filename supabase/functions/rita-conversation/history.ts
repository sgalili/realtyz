export function conversationHistory(messages: Array<{ content: string; created_at: string }>, interactions: Array<{ prompt: string; response: string | null; created_at: string }>): string {
  return [
    ...messages.map(item => ({ time: item.created_at, text: item.content })),
    ...interactions.map(item => ({ time: item.created_at, text: `בקשה לריטה: ${item.prompt}\nריטה: ${item.response ?? ''}` })),
  ].sort((a, b) => Date.parse(a.time) - Date.parse(b.time)).map(item => `${item.time}: ${item.text}`).join('\n').slice(-24000);
}
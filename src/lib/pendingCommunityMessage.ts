const KEY = 'toraff-pending-community-message';
/** Guest "send message" intent; resumed once after sign-in, then cleared. */
export function rememberPendingMessage(recipientId: string) { try { localStorage.setItem(KEY, JSON.stringify({ recipientId, at: Date.now() })); } catch { /* storage unavailable */ } }
export function takePendingMessage(): string | null {
  try {
    const raw = localStorage.getItem(KEY); if (!raw) return null; localStorage.removeItem(KEY);
    const v = JSON.parse(raw) as { recipientId?: string; at?: number };
    return v.recipientId && Date.now() - (v.at ?? 0) < 60 * 60 * 1000 ? v.recipientId : null;
  } catch { return null; }
}
export const messagePath = (id: string) => `/inbox?community=${encodeURIComponent(id)}`;

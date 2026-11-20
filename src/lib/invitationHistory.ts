import { FOLLOWUP_DELAY_MS } from '../../supabase/functions/_shared/importInvitationPolicy';

export type InvitationHistoryRecord = {
  user_id: string;
  channel: 'whatsapp' | 'email';
  status: string;
  sent_at: string;
};

const SENT_STATUSES = new Set(['accepted', 'sent', 'delivered', 'read']);
export const invitationHistoryKey = (item: InvitationHistoryRecord) => `${item.user_id}:${item.channel}:${item.sent_at}`;
export const wasActuallySent = (item: InvitationHistoryRecord) => SENT_STATUSES.has(item.status) && Number.isFinite(Date.parse(item.sent_at));

/** One original card per recipient/channel; only a delivered 48-hour follow-up is threaded into it. */
export function threadInvitationHistory<T extends InvitationHistoryRecord>(items: T[]): Array<T & { followups: T[] }> {
  const byRecipient = new Map<string, T & { followups: T[] }>();
  const chronological = [...items].sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
  for (const item of chronological) {
    const recipientKey = `${item.user_id}:${item.channel}`;
    const original = byRecipient.get(recipientKey);
    if (!original) {
      byRecipient.set(recipientKey, { ...item, followups: [] });
      continue;
    }
    const dueAt = Date.parse(original.sent_at) + FOLLOWUP_DELAY_MS;
    if (wasActuallySent(item) && Date.parse(item.sent_at) >= dueAt && original.followups.length === 0) {
      original.followups.push(item);
    }
  }
  return [...byRecipient.values()].sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at));
}

export const notificationEvents = ['new_high_priority', 'meeting_booked', 'critical_question'] as const;
export type NotificationEvent = typeof notificationEvents[number];
export const notificationChannels = ['whatsapp', 'sms', 'email'] as const;
export type NotificationChannel = typeof notificationChannels[number];
export const eventPreferenceKeys = { new_high_priority: 'notify_new_high_priority', meeting_booked: 'notify_meeting_booked', critical_question: 'notify_critical_question' } as const;
export function channelsForEvent(pref: { event_channels?: unknown; delivery_channel?: string }, event: NotificationEvent): NotificationChannel[] {
  const map = pref.event_channels && typeof pref.event_channels === 'object' ? pref.event_channels as Record<string, unknown> : {};
  if (Array.isArray(map[event])) return notificationChannels.filter(channel => (map[event] as unknown[]).includes(channel));
  // Historical email metadata never sent email and is not consent.
  return pref.delivery_channel === 'sms' ? ['sms'] : ['whatsapp'];
}
export function withinQuietHours(start: string | null, end: string | null, now = new Date()): boolean {
  if (!start || !end) return false;
  const minutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
  const current = now.getUTCHours() * 60 + now.getUTCMinutes();
  const from = minutes(start), to = minutes(end);
  return from <= to ? current >= from && current < to : current >= from || current < to;
}
export function allowsNotificationOverride(auth: string, serviceKey: string, requested?: string): boolean {
  return !requested || auth === `Bearer ${serviceKey}`;
}
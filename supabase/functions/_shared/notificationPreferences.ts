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
export type QuietDay = { enabled: boolean; start: string; end: string };
export type QuietWeek = Record<string, QuietDay>;
export function quietWeekFromPreferences(pref: { quiet_hours_weekly?: unknown; quiet_hours_start?: string | null; quiet_hours_end?: string | null }): QuietWeek {
  const raw = pref.quiet_hours_weekly;
  const weekly = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  return Object.fromEntries(Array.from({ length: 7 }, (_, day) => {
    const value = weekly?.[String(day)];
    const item = value && typeof value === 'object' ? value as Record<string, unknown> : null;
    return [String(day), weekly ? { enabled: item?.enabled === true, start: typeof item?.start === 'string' ? item.start.slice(0, 5) : '', end: typeof item?.end === 'string' ? item.end.slice(0, 5) : '' } : { enabled: !!(pref.quiet_hours_start && pref.quiet_hours_end), start: pref.quiet_hours_start?.slice(0, 5) ?? '', end: pref.quiet_hours_end?.slice(0, 5) ?? '' }];
  }));
}
export function quietWeekValid(week: QuietWeek): boolean {
  return Object.values(week).every(day => !day.enabled || (/^([01]\d|2[0-3]):[0-5]\d$/.test(day.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(day.end) && day.start !== day.end));
}
export function notificationIsQuiet(pref: { quiet_hours_weekly?: unknown; quiet_hours_start?: string | null; quiet_hours_end?: string | null }, now = new Date()): boolean {
  if (pref.quiet_hours_weekly == null) return withinQuietHours(pref.quiet_hours_start ?? null, pref.quiet_hours_end ?? null, now);
  const week = quietWeekFromPreferences(pref);
  const today = week[String(now.getUTCDay())];
  const previous = week[String((now.getUTCDay() + 6) % 7)];
  const current = now.getUTCHours() * 60 + now.getUTCMinutes();
  const minutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
  const valid = (day: QuietDay) => day.enabled && quietWeekValid({ day });
  if (valid(today)) {
    const start = minutes(today.start), end = minutes(today.end);
    if (start < end ? current >= start && current < end : current >= start) return true;
  }
  return valid(previous) && minutes(previous.start) > minutes(previous.end) && current < minutes(previous.end);
}
export function allowsNotificationOverride(auth: string, serviceKey: string, requested?: string): boolean {
  return !requested || auth === `Bearer ${serviceKey}`;
}
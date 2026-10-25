export const CALL_REMINDER_MINUTES = 60;

export function validateFutureCall(when: string, leadId: string | null, now = Date.now()) {
  if (!leadId) return 'בחר ליד לשיחה';
  const time = new Date(when).getTime();
  if (!Number.isFinite(time) || time <= now) return 'בחר תאריך ושעה עתידיים';
  return null;
}

export function callReminderAt(startsAt: string, createdAt: string) {
  return new Date(Math.max(new Date(createdAt).getTime(), new Date(startsAt).getTime() - CALL_REMINDER_MINUTES * 60_000)).toISOString();
}
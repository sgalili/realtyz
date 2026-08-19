/**
 * Business-hours rules for property tour scheduling (Asia/Jerusalem week).
 *  Sunday – Thursday : 09:00 - 18:00
 *  Friday            : 09:00 - 13:00
 *  Saturday          : closed
 * Shared by the public booking widget and the broker dashboard.
 */

export type DayWindow = { open: number; close: number } | null;

/** getDay(): 0=Sunday ... 6=Saturday */
export function windowForDay(day: number): DayWindow {
  if (day === 6) return null; // Saturday
  if (day === 5) return { open: 9 * 60, close: 13 * 60 }; // Friday
  return { open: 9 * 60, close: 18 * 60 }; // Sunday - Thursday
}

export const BUSINESS_HOURS_HE = [
  'ראשון עד חמישי: 09:00 - 18:00',
  'שישי: 09:00 - 13:00',
  'שבת: סגור',
];

export function minutesOf(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 30-minute slots available for the given date, as "HH:MM" strings. */
export function slotsForDate(date: string): string[] {
  if (!date) return [];
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return [];
  const win = windowForDay(d.getDay());
  if (!win) return [];
  const out: string[] = [];
  for (let t = win.open; t <= win.close - 30; t += 30) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return out;
}

/** Returns a Hebrew error string, or null when the slot is valid. */
export function validateTourSlot(date: string, time: string): string | null {
  if (!date) return 'יש לבחור תאריך';
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 'תאריך לא תקין';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d < today) return 'לא ניתן לתאם סיור בתאריך שעבר';

  const win = windowForDay(d.getDay());
  if (!win) return 'בשבת אין סיורים. יש לבחור יום ראשון עד שישי';

  if (!time) return 'יש לבחור שעה';
  const mins = minutesOf(time);
  if (mins == null) return 'שעה לא תקינה';
  const label = d.getDay() === 5 ? '09:00 - 13:00' : '09:00 - 18:00';
  if (mins < win.open || mins > win.close - 30) return `השעה מחוץ לשעות הפעילות (${label})`;

  const chosen = new Date(`${date}T${time}:00`);
  if (chosen.getTime() < Date.now()) return 'השעה שנבחרה כבר עברה';
  return null;
}

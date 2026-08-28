/**
 * Persisted preferences for the "תזמון פרסומים" dialogs (calendar + composer).
 *
 * Everything the broker picks in the dialog — time window, post count,
 * recurrence, selected properties and Facebook groups — survives page exits and
 * refreshes. Storage is namespaced per workspace owner so nothing leaks across
 * tenants.
 */

export type SchedulePrefs = {
  winStart: string;
  winEnd: string;
  winCount: number;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';
  recurrenceDays: number[];
  recurrenceCount: number;
  recurrenceCountInput?: string;
  selectedListingIds: string[];
  selectedGroupIds: string[];
  /** Max posts per day allowed for EACH selected group (0 = unlimited). */
  groupDailyLimit: number;
};

export const DEFAULT_SCHEDULE_PREFS: SchedulePrefs = {
  winStart: '09:00',
  winEnd: '21:00',
  winCount: 1,
  recurrence: 'none',
  recurrenceDays: [],
  recurrenceCount: 4,
  recurrenceCountInput: '',
  selectedListingIds: [],
  selectedGroupIds: [],
  groupDailyLimit: 0,
};


const key = (scope: string | null | undefined, slot: string) =>
  `rz:${scope ?? 'anon'}:schedule-prefs:${slot}`;

export function loadSchedulePrefs(scope: string | null | undefined, slot = 'default'): SchedulePrefs {
  try {
    const raw = localStorage.getItem(key(scope, slot));
    if (!raw) return { ...DEFAULT_SCHEDULE_PREFS };
    const parsed = JSON.parse(raw) as Partial<SchedulePrefs>;
    return {
      ...DEFAULT_SCHEDULE_PREFS,
      ...parsed,
      winStart: clampWindowTime(String(parsed?.winStart ?? '09:00'), '09:00'),
      winEnd: clampWindowTime(String(parsed?.winEnd ?? '21:00'), '21:00'),
      recurrenceDays: Array.isArray(parsed?.recurrenceDays) ? parsed.recurrenceDays : [],
      selectedListingIds: Array.isArray(parsed?.selectedListingIds) ? parsed.selectedListingIds : [],
      selectedGroupIds: Array.isArray(parsed?.selectedGroupIds) ? parsed.selectedGroupIds : [],
      winCount: Math.max(1, Math.min(20, Number(parsed?.winCount) || 1)),
      groupDailyLimit: Math.max(0, Math.min(50, Number(parsed?.groupDailyLimit) || 0)),

    };
  } catch {
    return { ...DEFAULT_SCHEDULE_PREFS };
  }
}

export function saveSchedulePrefs(
  scope: string | null | undefined,
  prefs: Partial<SchedulePrefs>,
  slot = 'default',
): void {
  try {
    const current = loadSchedulePrefs(scope, slot);
    localStorage.setItem(key(scope, slot), JSON.stringify({ ...current, ...prefs }));
  } catch {
    /* storage unavailable — preferences simply don't persist */
  }
}

/** HARD posting window — nothing is ever scheduled outside 09:00-21:00. */
export const POSTING_WINDOW_START_MIN = 9 * 60;
export const POSTING_WINDOW_END_MIN = 21 * 60;

/** Clamps a "HH:MM" string into the allowed posting window. */
export function clampWindowTime(value: string, fallback: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? ''));
  const raw = m ? Number(m[1]) * 60 + Number(m[2]) : null;
  const min = Math.min(
    POSTING_WINDOW_END_MIN,
    Math.max(POSTING_WINDOW_START_MIN, raw ?? Number.NaN),
  );
  if (!Number.isFinite(min)) return fallback;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

/** Moves a Date into the allowed window (same day, or next day when too late). */
export function clampDateToPostingWindow(input: Date): Date {
  const out = new Date(input);
  const min = out.getHours() * 60 + out.getMinutes();
  if (min < POSTING_WINDOW_START_MIN) {
    out.setHours(9, Math.floor(Math.random() * 45), 0, 0);
  } else if (min > POSTING_WINDOW_END_MIN) {
    out.setDate(out.getDate() + 1);
    out.setHours(9, Math.floor(Math.random() * 45), 0, 0);
  }
  return out;
}

/**
 * Pick a random minute strictly INSIDE the [startMin, endMin] window, inside the
 * i-th of `count` buckets. Never lands exactly on the window edges so posts
 * never look machine-timed at the boundary hours. The window itself is always
 * clamped to the hard 09:00-21:00 posting hours.
 */
export function randomSlotMinutes(startMin: number, endMin: number, i: number, count: number): number {
  const safeStart = Math.max(POSTING_WINDOW_START_MIN, Math.min(startMin, POSTING_WINDOW_END_MIN - 30));
  const safeEnd = Math.min(POSTING_WINDOW_END_MIN, Math.max(endMin, safeStart + 30));
  const span = Math.max(1, safeEnd - safeStart);
  const n = Math.max(1, count);
  const bucket = span / n;
  const margin = Math.min(bucket / 4, 7);
  const lo = safeStart + i * bucket + margin;
  const hi = safeStart + (i + 1) * bucket - margin;
  const value = hi > lo ? lo + Math.random() * (hi - lo) : (lo + hi) / 2;
  // Clamp strictly inside the overall window.
  return Math.min(Math.max(value, safeStart + 1), safeEnd - 1);
}

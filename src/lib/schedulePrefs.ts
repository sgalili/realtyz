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
      recurrenceDays: Array.isArray(parsed?.recurrenceDays) ? parsed.recurrenceDays : [],
      selectedListingIds: Array.isArray(parsed?.selectedListingIds) ? parsed.selectedListingIds : [],
      selectedGroupIds: Array.isArray(parsed?.selectedGroupIds) ? parsed.selectedGroupIds : [],
      winCount: Math.max(1, Math.min(20, Number(parsed?.winCount) || 1)),
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

/**
 * Pick a random minute strictly INSIDE the [startMin, endMin] window, inside the
 * i-th of `count` buckets. Never lands exactly on the window edges so posts
 * never look machine-timed at the boundary hours.
 */
export function randomSlotMinutes(startMin: number, endMin: number, i: number, count: number): number {
  const span = Math.max(1, endMin - startMin);
  const n = Math.max(1, count);
  const bucket = span / n;
  const margin = Math.min(bucket / 4, 7);
  const lo = startMin + i * bucket + margin;
  const hi = startMin + (i + 1) * bucket - margin;
  const value = hi > lo ? lo + Math.random() * (hi - lo) : (lo + hi) / 2;
  // Clamp strictly inside the overall window.
  return Math.min(Math.max(value, startMin + 1), endMin - 1);
}

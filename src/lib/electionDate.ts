// Single source of truth for the official Israeli election day.
// Final election date set to: 27 October 2026.
//
// Note on JS Date: months are 0-indexed → month "9" = October.
export const ELECTION_DATE = new Date(2026, 9, 27);

/** Days remaining until election day (clamped at 0). */
export function daysUntilElection(now: Date = new Date()): number {
  const ms = ELECTION_DATE.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Whole months remaining until election day (rounded up, clamped at 0). */
export function monthsUntilElection(now: Date = new Date()): number {
  return Math.max(0, Math.ceil(daysUntilElection(now) / 30));
}

/** Hebrew formatted election date, e.g. "27.10.2026". */
export const ELECTION_DATE_HE = '27.10.2026';

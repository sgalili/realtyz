export type ImportedLicenseState = { status: 'verified' | 'unverified' | 'pending_review' | 'blocked'; license_number?: string | null; review_pending?: boolean; grace_ends_at?: string; days_left?: number };
export function importedLicenseDaysLabel(days: number) {
  if (days <= 0) return 'היום הוא היום האחרון לאימות הרישיון';
  if (days === 1) return 'נותר יום אחד לאימות הרישיון';
  return `נותרו ${days} ימים לאימות הרישיון`;
}

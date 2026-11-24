/** Compact imported/total label, e.g. "(4/12)". Missing or invalid totals fall back to the imported count, never NaN. */
export function importRatioLabel(imported: unknown, total: unknown): string {
  const i = Number(imported); const t = Number(total);
  const done = Number.isFinite(i) && i > 0 ? Math.floor(i) : 0;
  const all = total !== null && total !== undefined && Number.isFinite(t) && t >= 0 ? Math.max(Math.floor(t), done) : null;
  return all === null ? `(${done})` : `(${done}/${all})`;
}
/** True only when Yad2 is known to hold more ads than were imported. */
export function hasMoreOnYad2(imported: unknown, total: unknown): boolean {
  const i = Number(imported); const t = Number(total);
  return total !== null && total !== undefined && Number.isFinite(t) && Number.isFinite(i) && i < t;
}

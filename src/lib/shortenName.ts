/**
 * Keep long page / group names on a SINGLE line.
 * Hard-shortens the string (with an explicit "(...)" suffix) so RTL names can
 * never wrap or spill outside their card, even when CSS truncation fails.
 */
export function shortenName(name: string | null | undefined, max = 45): string {
  const s = String(name ?? '').trim();
  const suffix = '(...)';
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(1, max - suffix.length)).trimEnd()}${suffix}`;
}

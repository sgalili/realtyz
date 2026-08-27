/**
 * Keep long page / group names on a SINGLE line.
 * Hard-shortens the string (with an ellipsis) so RTL names can never wrap or
 * spill outside their card, even when CSS truncation fails inside flex layouts.
 */
export function shortenName(name: string | null | undefined, max = 28): string {
  const s = String(name ?? '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

// Single source of truth for rendering a property's COMPLETE address.
//
// Every property surface (internal pages, edit screens, public listings,
// shared links, affiliate landing pages) must show the same full address:
//   street + house number, apartment number, neighborhood, city.
// e.g. "מוהליבר 1, דירה 3, מרכז העיר, תל אביב"

export type AddressParts = {
  address?: string | null;
  street?: string | null;
  house_number?: string | number | null;
  apartment_number?: string | number | null;
  neighborhood?: string | null;
  city?: string | null;
};

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function hasToken(line: string, token: string): boolean {
  if (!token) return true;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s,])${escaped}([\\s,]|$)`).test(line);
}

/** "מוהליבר 1, דירה 3" — street line with house and apartment numbers. */
export function streetLine(parts: AddressParts): string {
  const city = clean(parts.city);
  const hood = clean(parts.neighborhood);
  let line = clean(parts.address || parts.street)
    .split(',')
    .map((piece) => piece.trim())
    .filter((piece) => piece && piece !== city && piece !== hood)
    .join(', ');

  // A bare number without a street name is never shown.
  const house = clean(parts.house_number);
  if (line && house && !hasToken(line, house)) line = `${line} ${house}`;

  const apt = clean(parts.apartment_number);
  const hasApt = /(דירה|דירת|יח["׳']|apt|unit)\s*\d/i.test(line);
  if (line && apt && !hasApt) line = `${line}, דירה ${apt}`;

  return line;
}

/** Full display address: street line, neighborhood, city. */
export function fullPropertyAddress(parts: AddressParts): string {
  const city = clean(parts.city);
  const hood = clean(parts.neighborhood);
  const line = streetLine(parts);
  const out: string[] = [];
  for (const piece of [line, hood, city]) {
    if (piece && !out.includes(piece)) out.push(piece);
  }
  return out.join(', ');
}

/** Geocodable query for maps and navigation apps (no apartment number). */
export function addressMapQuery(parts: AddressParts): string {
  const city = clean(parts.city);
  const street = streetLine({ ...parts, apartment_number: null });
  // Without a street we still map the neighborhood / city area.
  const out = [street || clean(parts.neighborhood), city].filter(Boolean);
  const query = out.join(', ');
  return query ? `${query}, ישראל` : '';
}

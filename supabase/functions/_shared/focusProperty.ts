// ============================================================
// focusProperty
// ------------------------------------------------------------
// Resolves THE ONE property an inbound message is about, and renders it as a
// compact context block for Rita.
//
// Two paths:
//  1. A known listing id (affiliate ref tag / short link / shared context).
//  2. Zero-question extraction straight from the message text. Our own
//     click-to-chat opener always carries street + city
//     ("היי ריטה, אשמח לקבל פרטים אודות הדירה ברחוב סוקולוב 15 בהרצליה"),
//     so Rita must never answer "על איזה נכס מדובר?".
// ============================================================

export const FOCUS_COLUMNS =
  "id, property_title, address, house_number, city, neighborhood, deal_type, rooms, sqm, floor, parking, elevator, features, asking_price, description";

export type FocusRow = Record<string, unknown>;

/** Compact Hebrew facts block for the ONE property in focus. */
export function renderFocusPropertyBlock(row: FocusRow | null | undefined): string {
  if (!row) return "";
  const l = row as Record<string, any>;
  return [
    `כתובת/כותרת: ${[l.address, l.house_number].filter(Boolean).join(" ") || l.property_title || "-"}`,
    `${l.city ?? ""} ${l.neighborhood ?? ""}`.trim(),
    l.deal_type === "rent" ? "סוג עסקה: השכרה" : l.deal_type === "sale" ? "סוג עסקה: מכירה" : "",
    l.rooms ? `חדרים: ${l.rooms}` : "",
    l.sqm ? `מ"ר: ${l.sqm}` : "",
    l.floor !== null && l.floor !== undefined && l.floor !== "" ? `קומה: ${l.floor}` : "",
    l.parking ? `חניה: ${typeof l.parking === "boolean" ? "יש" : l.parking}` : "",
    l.elevator === true ? "מעלית: יש" : l.elevator === false ? "מעלית: אין" : "",
    Array.isArray(l.features) && l.features.length ? `מאפיינים: ${l.features.slice(0, 8).join(", ")}` : "",
    l.asking_price ? `מחיר: ${Number(l.asking_price).toLocaleString("he-IL")} ש"ח` : "",
    l.description ? `תיאור: ${String(l.description).slice(0, 600)}` : "",
  ].filter(Boolean).join("\n");
}

/** Normalises Hebrew punctuation variants so street names compare cleanly. */
function norm(value: unknown): string {
  return String(value ?? "")
    .replace(/["'`״׳]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const KNOWN_CITIES = [
  "תל אביב", "ירושלים", "חיפה", "הרצליה", "רעננה", "כפר סבא", "רמת גן", "גבעתיים", "נתניה",
  "הוד השרון", "רמת השרון", "פתח תקווה", "ראשון לציון", "חולון", "בת ים", "רחובות", "אשדוד", "אשקלון",
  "באר שבע", "מודיעין", "כפר שמריהו", "רמלה", "לוד", "נס ציונה", "קריית אונו", "אור יהודה", "יהוד",
  "ראש העין", "חדרה", "עפולה", "נהריה", "עכו", "טבריה", "אילת", "בני ברק", "זכרון יעקב", "קיסריה", "אבן יהודה",
];

/** True when the message itself names a concrete address (street + house number). */
export function textNamesAddress(text: string): boolean {
  const t = norm(text);
  return /(?:רחוב|ברחוב|ברח|רח)\s*[א-ת][א-ת\s-]{1,25}\s\d{1,4}/.test(t) ||
    /[א-ת]{2,}\s\d{1,4}[א-ת]?\s*,?\s*ב?[א-ת]{3,}/.test(t) ||
    /[a-z]{3,}\s\d{1,4},?\s*[a-z]{3,}/i.test(t);
}

/** Prompt block when the contact named an address that is not in the workspace. */
export const ADDRESS_NOT_FOUND_BLOCK =
  "\n\n[ADDRESS_NOT_FOUND] איש הקשר ציין כתובת שאינה קיימת במאגר הנכסים. אסור להציג או להציע נכס אחר מעיר או רחוב אחרים. " +
  "השיבי בנימוס שלא מצאת נכס בכתובת הזו, ובקשי לוודא את שם הרחוב, מספר הבית והעיר או לשלוח קישור למודעה.";

function splitAddress(address: unknown): { street: string; house: string } {
  const a = norm(address).replace(/,.*$/, "");
  const m = a.match(/^(.*?)\s+(\d{1,4}[א-ת]?)(?:\s+\d{1,4}[א-ת]?)?\s*$/);
  return m ? { street: m[1].trim(), house: m[2] } : { street: a.replace(/\d+/g, "").trim(), house: "" };
}

/**
 * Finds the workspace listing the inbound text is talking about.
 * Strict: the street must appear; when the text names a city the listing must
 * be in that city; when a house number follows the street it must match.
 * Returns null rather than a near-miss from another city.
 */
export async function matchListingFromText(
  admin: { from: (table: string) => any },
  ownerId: string,
  text: string,
): Promise<FocusRow | null> {
  const haystack = norm(text);
  if (!ownerId || haystack.length < 6) return null;
  // Explicit listing id (pasted ad link / share URL) wins, workspace-scoped.
  const ids = [...String(text ?? "").matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)].map((m) => m[0].toLowerCase());
  if (ids.length) {
    try {
      const { data } = await admin
        .from("listings")
        .select(FOCUS_COLUMNS)
        .eq("workspace_owner_id", ownerId)
        .in("id", ids.slice(0, 5))
        .limit(1);
      if (data?.[0]) return data[0] as FocusRow;
    } catch (_) { /* fall through to text matching */ }
  }
  // Shared ad link by slug (realtyz.co.il/.../<slug>), workspace-scoped.
  const slugs = [...String(text ?? "").matchAll(/realtyz\.co\.il\/[^\s?#]*?([A-Za-z0-9\u0590-\u05FF%_-]{6,120})(?=[\s?#]|$)/gi)]
    .map((m) => { try { return decodeURIComponent(m[1]); } catch { return m[1]; } });
  if (slugs.length) {
    try {
      const { data } = await admin.from("listings").select(FOCUS_COLUMNS).eq("workspace_owner_id", ownerId).in("slug", slugs.slice(0, 5)).limit(1);
      if (data?.[0]) return data[0] as FocusRow;
    } catch (_) { /* fall through */ }
  }
  try {
    const { data } = await admin
      .from("listings")
      .select(FOCUS_COLUMNS)
      .eq("workspace_owner_id", ownerId)
      .or("status.is.null,status.neq.discarded")
      .order("updated_at", { ascending: false })
      .limit(500);
    const rows = (data ?? []) as FocusRow[];
    const cityNames = new Set<string>(KNOWN_CITIES.map(norm));
    for (const r of rows) { const c = norm((r as any).city); if (c.length >= 2) cityNames.add(c); }
    const mentioned = [...cityNames].filter((c) => haystack.includes(c));

    let best: { row: FocusRow; score: number } | null = null;
    for (const row of rows) {
      const r = row as Record<string, any>;
      const { street, house: addrHouse } = splitAddress(r.address);
      const title = norm(r.property_title);
      if (title.length >= 8 && haystack.includes(title)) {
        if (!best || best.score < 10) best = { row, score: 10 };
        continue;
      }
      if (street.length < 3 || !haystack.includes(street)) continue;
      const city = norm(r.city);
      if (mentioned.length && (!city || !mentioned.some((c) => c === city || c.includes(city) || city.includes(c)))) continue;
      const house = norm(r.house_number) || addrHouse;
      const esc = street.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const asked = haystack.match(new RegExp(`${esc}\\s+(\\d{1,4}[א-ת]?)`))?.[1];
      if (asked && house && asked !== house) continue;
      let score = 2;
      if (city && mentioned.length) score += 2;
      if (asked && house === asked) score += 3;
      const hood = norm(r.neighborhood);
      if (hood && haystack.includes(hood)) score += 1;
      score += Math.min(street.length, 20) / 100;
      if (!best || score > best.score) best = { row, score };
    }
    return best ? best.row : null;
  } catch (_) {
    return null;
  }
}

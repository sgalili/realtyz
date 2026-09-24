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

/**
 * Finds the workspace listing the inbound text is talking about.
 * Deterministic scoring: street name match is mandatory, city and house number
 * only break ties. Returns null when nothing matches confidently.
 */
export async function matchListingFromText(
  admin: { from: (table: string) => any },
  ownerId: string,
  text: string,
): Promise<FocusRow | null> {
  const haystack = norm(text);
  if (!ownerId || haystack.length < 6) return null;
  try {
    const { data } = await admin
      .from("listings")
      .select(FOCUS_COLUMNS)
      .eq("workspace_owner_id", ownerId)
      .not("address", "is", null)
      .order("updated_at", { ascending: false })
      .limit(300);

    let best: { row: FocusRow; score: number } | null = null;
    for (const row of (data ?? []) as FocusRow[]) {
      const r = row as Record<string, any>;
      const street = norm(r.address).replace(/\s*\d+[א-ת]?\s*$/, "");
      if (street.length < 3 || !haystack.includes(street)) continue;
      let score = 2;
      const city = norm(r.city);
      if (city && haystack.includes(city)) score += 2;
      const house = norm(r.house_number);
      if (house && new RegExp(`${street}\\s+${house}(?!\\d)`).test(haystack)) score += 2;
      const hood = norm(r.neighborhood);
      if (hood && haystack.includes(hood)) score += 1;
      // Longer street names are more specific, so they win ties.
      score += Math.min(street.length, 20) / 100;
      if (!best || score > best.score) best = { row, score };
    }
    return best ? best.row : null;
  } catch (_) {
    return null;
  }
}

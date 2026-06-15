// _shared/owner-laws.ts
// Two compliance laws enforced on EVERY AI-generated text that ships to the
// public (social posts, comments/replies, outreach copy, property profile
// drafts, IVR scripts, etc):
//
//   LAW #1 — STREET-NUMBER REDACTION:
//     Remove specific house/building numbers from street addresses so a
//     listing's exact door can't be derived from a marketing post.
//     "ארלוזורוב 26" → "ברחוב ארלוזורוב"
//     "רחוב ויצמן 4" → "רחוב ויצמן"
//
//   LAW #2 — BROKER LICENSE FOOTER (posts / outreach / property drafts only):
//     Always append the workspace owner's real-estate broker license number
//     on a clean newline at the very bottom of the output.
//     "רישיון תיווך מספר: 123456"
//
// Both rules are also injected into #CRITICAL_SYSTEM_PREFERENCES by
// `_shared/system-rules.ts`, but this module is the deterministic safety net:
// it runs on the buffer right before we hand the text to the user / to
// Ayrshare / to the inbox / to ElevenLabs, so even a non-compliant model
// output is corrected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// ── Street-keyword anchors (Hebrew). We only strip a trailing number when the
//    address is clearly a street address — never near "חדרים", "מ"ר", price, %,
//    "שנה", etc.
const STREET_KEYWORDS = [
  "רחוב", "רח'", "רח׳", "רח",
  "שדרות", "שד'", "שד׳",
  "סמטת", "סמטה",
  "דרך", "טיילת", "ככר", "כיכר",
];

const STREET_KEYWORD_GROUP = STREET_KEYWORDS
  .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

// Trailing-unit blocklist — these tokens after a number mean "this is NOT a
// street number" (e.g. "4 חדרים", "85 מ"ר", "1,200,000 ₪", "30%").
const TRAILING_UNITS = /(?:חדרים|חדר|מ["׳']?\s*ר|מטר|מ['׳]|ק["׳']?\s*מ|קומה|קומות|דקות|שעות|שנה|שנים|אחוז|%|₪|ש["׳']?\s*ח|דולר|\$|€)/;

/**
 * LAW #1 — strip building/house numbers from street addresses.
 * Conservative: only touches digits that are obviously part of a street name.
 */
export function stripStreetNumbers(input: string): string {
  let out = String(input ?? "");
  if (!out) return out;

  // Pattern A: "<street-keyword> <hebrew name> <digits>[suffix-letter]"
  //   → keep "<street-keyword> <hebrew name>"
  const reA = new RegExp(
    `(${STREET_KEYWORD_GROUP})\\s+([\\u0590-\\u05FF][\\u0590-\\u05FF״"׳'\\-\\s]{1,40}?)\\s+\\d{1,4}[א-ת]?\\b`,
    "g",
  );
  out = out.replace(reA, (_m, kw, name) => `${kw} ${String(name).trim()}`);

  // Pattern B: standalone "<hebrew word> <digits>" NOT followed by a unit.
  //   Risky but covers "ארלוזורוב 26" with no prefix. Guarded by:
  //     - the hebrew word is 3+ letters
  //     - the next token is NOT a unit (חדרים / מ"ר / ₪ / % / …)
  //     - not preceded by a digit (so "1,200,000 ₪" is safe)
  //     - not preceded by ":" or "=" (price/key contexts)
  const reB = /(^|[^\d:=״"׳'\u05F4\u05F3])([\u0590-\u05FF]{3,}(?:[\u0590-\u05FF״"׳'-]*[\u0590-\u05FF])?)\s+(\d{1,4})[א-ת]?\b/g;
  out = out.replace(reB, (m, pre, word, num, offset, full) => {
    const after = full.slice(offset + m.length, offset + m.length + 24);
    if (TRAILING_UNITS.test(after.trim())) return m;            // not an address
    // Skip very common non-address Hebrew nouns that frequently precede numbers
    if (/^(שנת|שנה|גיל|טלפון|נייד|מספר|דירה|קומה|בנין|בניין|פרויקט|פרוייקט)$/.test(word)) return m;
    return `${pre}${word}`;
  });

  // Cleanup double spaces left behind.
  return out.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.!?])/g, "$1");
}

/**
 * LAW #2 — append the workspace owner's broker-license footer if missing.
 * Pass an empty license to fall back to a "[יש להזין מספר רישיון]" placeholder
 * so the owner immediately notices the missing setting.
 */
export function appendLicenseFooter(text: string, license?: string | null): string {
  const body = String(text ?? "").replace(/\s+$/g, "");
  if (!body) return body;
  const lic = (license ?? "").toString().trim();
  // Don't double-append if footer is already present (Hebrew or English label).
  if (/רישיון\s*תיווך\s*מספר\s*[:：]/i.test(body) || /broker\s*license\s*(?:no\.?|number)\s*[:：]/i.test(body)) {
    return body;
  }
  const footer = lic
    ? `רישיון תיווך מספר: ${lic}`
    : `רישיון תיווך מספר: [יש להזין מספר רישיון בפרופיל]`;
  return `${body}\n\n${footer}`;
}

/**
 * Run both laws. `withLicense=false` for short surfaces (comment replies, IVR
 * line previews) where a license footer would feel out of place.
 */
export function enforceOwnerLaws(
  text: string,
  opts: { license?: string | null; withLicense?: boolean } = {},
): string {
  const { license, withLicense = true } = opts;
  const stripped = stripStreetNumbers(text);
  return withLicense ? appendLicenseFooter(stripped, license) : stripped;
}

// ── License lookup (cached per-process; cheap fallback when no DB hit). ──
const licenseCache = new Map<string, { at: number; value: string }>();
const LIC_TTL_MS = 60_000;

export async function fetchOwnerLicense(
  admin: ReturnType<typeof createClient>,
  userId: string | null | undefined,
): Promise<string> {
  if (!userId) return "";
  const hit = licenseCache.get(userId);
  if (hit && Date.now() - hit.at < LIC_TTL_MS) return hit.value;
  try {
    // Resolve workspace owner first so team members inherit the broker's license.
    const { data: profile } = await admin
      .from("profiles")
      .select("active_workspace_owner_id, broker_license_number")
      .eq("id", userId)
      .maybeSingle();
    let lic = (profile?.broker_license_number as string | null) || "";
    const ownerId = (profile?.active_workspace_owner_id as string | null) || null;
    if (!lic && ownerId && ownerId !== userId) {
      const { data: owner } = await admin
        .from("profiles")
        .select("broker_license_number")
        .eq("id", ownerId)
        .maybeSingle();
      lic = (owner?.broker_license_number as string | null) || "";
    }
    lic = (lic || "").trim();
    licenseCache.set(userId, { at: Date.now(), value: lic });
    return lic;
  } catch {
    return "";
  }
}

// _shared/owner-laws.ts
// Two compliance laws + brand-byline enforcement on every AI-generated text
// that ships to the public.
//
//   LAW #1 — STREET-NUMBER REDACTION:
//     "ארלוזורוב 26" → "ברחוב ארלוזורוב"
//
//   LAW #2 — BROKER LICENSE FOOTER (posts / outreach / property drafts):
//     Append the workspace owner's byline + license on a clean new line at
//     the very bottom of the output. Example:
//
//       אודי ויטמן, אנגלו-סכסון, הרצליה/רמה״ש
//       רישיון תיווך מספר: 123456
//
//   BYLINE SCRUB:
//     Strip "Udi Vitman Real Estate" / "אודי ויטמן נדל"ן" / "אודי ויטמן | תיווך"
//     and any other invented agency-title styling — only the canonical byline
//     above is allowed in the body. (Then the footer block re-appends the
//     canonical byline at the bottom for posts/outreach.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// ── Street-keyword anchors. We only strip a trailing number when the address
//    is clearly a street address — never near "חדרים", "מ"ר", price, %, etc.
const STREET_KEYWORDS = [
  "רחוב", "רח'", "רח׳", "רח",
  "שדרות", "שד'", "שד׳",
  "סמטת", "סמטה",
  "דרך", "טיילת", "ככר", "כיכר",
];
const STREET_KEYWORD_GROUP = STREET_KEYWORDS
  .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const TRAILING_UNITS = /(?:חדרים|חדר|מ["׳']?\s*ר|מטר|מ['׳]|ק["׳']?\s*מ|קומה|קומות|דקות|שעות|שנה|שנים|אחוז|%|₪|ש["׳']?\s*ח|דולר|\$|€)/;

/** LAW #1 — strip building/house numbers from street addresses. */
export function stripStreetNumbers(input: string): string {
  let out = String(input ?? "");
  if (!out) return out;

  // Pattern A: "<street-keyword> <hebrew name> <digits>[suffix]" → drop digits.
  const reA = new RegExp(
    `(${STREET_KEYWORD_GROUP})\\s+([\\u0590-\\u05FF][\\u0590-\\u05FF״"׳'\\-\\s]{1,40}?)\\s+\\d{1,4}[א-ת]?\\b`,
    "g",
  );
  out = out.replace(reA, (_m, kw, name) => `${kw} ${String(name).trim()}`);

  // Pattern B: standalone "<hebrew word> <digits>" NOT followed by a unit.
  const reB = /(^|[^\d:=״"׳'\u05F4\u05F3])([\u0590-\u05FF]{3,}(?:[\u0590-\u05FF״"׳'-]*[\u0590-\u05FF])?)\s+(\d{1,4})[א-ת]?\b/g;
  out = out.replace(reB, (m, pre, word, _num, offset, full) => {
    const after = String(full).slice(offset + m.length, offset + m.length + 24);
    if (TRAILING_UNITS.test(after.trim())) return m;
    if (/^(שנת|שנה|גיל|טלפון|נייד|מספר|דירה|קומה|בנין|בניין|פרויקט|פרוייקט|בן|בת)$/.test(word)) return m;
    return `${pre}${word}`;
  });

  // Pattern C: "address: ארלוזורוב 26" or "כתובת: ויצמן 4" — keep label, drop digits.
  out = out.replace(
    /(כתובת|address|location)\s*[:：]\s*([\u0590-\u05FF][\u0590-\u05FF\s\-״"׳']{1,40}?)\s+\d{1,4}[א-ת]?\b/gi,
    (_m, label, name) => `${label}: ${String(name).trim()}`,
  );

  return out.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.!?])/g, "$1");
}

// Forbidden invented-title patterns. We never let the model attach a fake
// agency suffix to the broker's name. Cases handled:
//   "אודי ויטמן נדל"ן"   →  "אודי ויטמן"
//   "אודי ויטמן | תיווך"  →  "אודי ויטמן"
//   "אודי ויטמן - יועץ נדל"ן" → "אודי ויטמן"
//   "Udi Vitman Real Estate" / "Udi Vitman Realty" → "Udi Vitman"
const FORBIDDEN_TITLE_PATTERNS: RegExp[] = [
  /(אודי\s+ויטמן)\s*(?:\||,|-|–|—)\s*(?:נדל["׳]?\s*ן|נדלן|תיווך|יועץ\s+נדל["׳]?\s*ן|סוכן|מתווך|משרד|real\s*estate|realty)[^\n]*/gi,
  /(אודי\s+ויטמן)\s+(?:נדל["׳]?\s*ן|נדלן|תיווך|מתווך|סוכן|משרד)[^\n]*/g,
  /(Udi\s+Vitman)\s+(?:Real\s*Estate|Realty|Realtor|Brokerage|Properties)[^\n]*/gi,
];

export function scrubForbiddenBylines(input: string): string {
  let out = String(input ?? "");
  for (const re of FORBIDDEN_TITLE_PATTERNS) out = out.replace(re, "$1");
  // Collapse trailing punctuation like "אודי ויטמן ," → "אודי ויטמן"
  out = out.replace(/(אודי\s+ויטמן)\s*[\|,\-–—]+\s*$/gm, "$1");
  return out.replace(/[ \t]{2,}/g, " ");
}

const FOOTER_RE = /רישיון\s*תיווך\s*מספר\s*[:：]/i;

/**
 * Append `<byline>\n<license-line>` at the very bottom of `text`, on a fresh
 * line, and ONLY if not already present. `byline` is optional; when omitted
 * we still emit the license line so the law is honored.
 */
export function appendLicenseFooter(
  text: string,
  license?: string | null,
  byline?: string | null,
): string {
  const body = String(text ?? "").replace(/\s+$/g, "");
  if (!body) return body;
  const lic = (license ?? "").toString().trim();
  const bln = (byline ?? "").toString().trim();
  // Strip any prior placeholder footer that older drafts may carry.
  let cleaned = body.replace(
    /\n*\s*רישיון\s*תיווך\s*מספר\s*[:：]\s*\[[^\]]*\]\s*$/u,
    "",
  ).replace(/\s+$/g, "");
  if (FOOTER_RE.test(cleaned)) return cleaned; // already has a real footer
  if (!lic) {
    // No license configured → do NOT emit the placeholder line. Optionally
    // keep just the byline so brand attribution still appears.
    return bln ? `${cleaned}\n\n${bln}` : cleaned;
  }
  const licenseLine = `רישיון תיווך מספר: ${lic}`;
  const footer = bln ? `${bln}\n${licenseLine}` : licenseLine;
  return `${cleaned}\n\n${footer}`;
}

export function enforceOwnerLaws(
  text: string,
  opts: {
    license?: string | null;
    byline?: string | null;
    withLicense?: boolean;
  } = {},
): string {
  const { license, byline, withLicense = true } = opts;
  let out = stripStreetNumbers(scrubForbiddenBylines(text));
  if (withLicense) out = appendLicenseFooter(out, license, byline);
  return out;
}

// ── Owner branding lookup (license + byline). 60s cache per process. ──
type Branding = { license: string; byline: string };
const brandingCache = new Map<string, { at: number; v: Branding }>();
const TTL = 60_000;

export async function fetchOwnerBranding(
  admin: ReturnType<typeof createClient>,
  userId: string | null | undefined,
): Promise<Branding> {
  const empty: Branding = { license: "", byline: "" };
  if (!userId) return empty;
  const hit = brandingCache.get(userId);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  try {
    const { data: me } = await admin
      .from("profiles")
      .select("active_workspace_owner_id, broker_license_number, broker_byline")
      .eq("id", userId)
      .maybeSingle();
    let lic = String((me as any)?.broker_license_number ?? "").trim();
    let bln = String((me as any)?.broker_byline ?? "").trim();
    const ownerId = (me as any)?.active_workspace_owner_id ?? null;
    if ((!lic || !bln) && ownerId && ownerId !== userId) {
      const { data: owner } = await admin
        .from("profiles")
        .select("broker_license_number, broker_byline")
        .eq("id", ownerId)
        .maybeSingle();
      if (!lic) lic = String((owner as any)?.broker_license_number ?? "").trim();
      if (!bln) bln = String((owner as any)?.broker_byline ?? "").trim();
    }
    const v = { license: lic, byline: bln };
    brandingCache.set(userId, { at: Date.now(), v });
    return v;
  } catch {
    return empty;
  }
}

/** Back-compat wrapper kept for older imports. */
export async function fetchOwnerLicense(
  admin: ReturnType<typeof createClient>,
  userId: string | null | undefined,
): Promise<string> {
  const { license } = await fetchOwnerBranding(admin, userId);
  return license;
}

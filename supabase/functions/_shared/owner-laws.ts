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

const FOOTER_RE = /ר\.?\s*מ\s*[:：]\s*3251676/i;
const OWNER_PHONE = "052-2973500";
const PHONE_RE = /052[\s\-]?297[\s\-]?3500/;

// HARD compliance constants. Udi's real byline + license — never replace,
// never read from env, never fall back to anything else.
const DEFAULT_OWNER_LICENSE = "3251676";
// STRICT canonical 2-line footer — exactly as the owner specified.
const OWNER_BYLINE_LINE = 'אודי ויטמן | אנגלו סכסון הרצליה/רמ"ש';
const OWNER_LICENSE_LINE = `ר.מ: ${DEFAULT_OWNER_LICENSE} | ${OWNER_PHONE}`;

function buildFooterBlock(_license?: string | null): string {
  // Byline + license are HARDCODED — ignore any caller-supplied value.
  return `${OWNER_BYLINE_LINE}\n${OWNER_LICENSE_LINE}`;
}

/**
 * Append the canonical owner footer (strict 2-line block) at the very bottom
 * of `text`. Strips any prior contact lines, phone numbers, byline variants,
 * or license lines the AI may have produced so the final block is unique.
 */
export function appendLicenseFooter(
  text: string,
  _license?: string | null,
  _byline?: string | null,
): string {
  const body = String(text ?? "").replace(/\s+$/g, "");
  if (!body) return body;

  // Strip every prior signature/contact variant so we emit ONE canonical block.
  let cleaned = body
    // old license lines
    .replace(/\n*\s*רישיון\s*תיווך\s*מספר\s*[:：][^\n]*/gu, "")
    .replace(/\n*\s*רישיון\s*תיווך\s*\d[^\n]*/gu, "")
    .replace(/\n*\s*ר\.?\s*מ\s*[:：][^\n]*/gu, "")
    // any prior byline line (Udi Witman + agency)
    .replace(/\n*\s*אודי\s+ויטמן[^\n]*אנגלו[^\n]*/gu, "")
    .replace(/\n*\s*אודי\s+ויטמן[^\n]*/gu, "")
    // old contact/CTA lines the AI sometimes generates
    .replace(/\n*[^\n]*לקבלת\s+פרטים\s+נוספים[^\n]*/gu, "")
    .replace(/\n*[^\n]*לפרטים\s+נוספים[^\n]*/gu, "")
    .replace(/\n*[^\n]*תיאום\s+(?:סיור|ביקור|צפייה|צפיה)[^\n]*/gu, "")
    .replace(/\n*[^\n]*שלחו\s+הודעה\s+(?:או|ב)?\s*וו?ואטסאפ[^\n]*/gu, "")
    .replace(/\n*[^\n]*וו?ואטסאפ\s+או\s+בטלפון[^\n]*/gu, "")
    // bare phone numbers (with or without emoji prefix)
    .replace(/\n*\s*(?:📞|☎️|📱)?\s*0?5[0-9][\s\-]?\d{3}[\s\-]?\d{4}[^\n]*/gu, "")
    .replace(/בהליך\s*אימות/gu, "")
    // STRICT: AI-assisted watermark is forbidden — purge every variant.
    .replace(/,\s*תוכן\s*בסיוע\s*AI/giu, "")
    .replace(/תוכן\s*בסיוע\s*AI/giu, "")
    .replace(/,\s*AI[- ]assisted\s*content/giu, "")
    .replace(/AI[- ]assisted\s*content/giu, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+$/g, "");

  return `${cleaned}\n\n${OWNER_BYLINE_LINE}\n${OWNER_LICENSE_LINE}`;
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
  // Step 0: strip placeholder brackets (e.g. "[Insert license number]",
  // "[מספר טלפון]", "[Real Phone Number]", "[TBD]") — never let bracketed
  // instruction tokens ship to the public.
  let out = String(text ?? "").replace(
    /\[[^\]\n]{0,80}(?:insert|placeholder|tbd|real\s+(?:phone|license)|phone|license|רישיון|טלפון|מספר\s*טלפון|מספר\s*רישיון|your\s+\w+)[^\]\n]{0,80}\]/giu,
    "",
  );
  // Step 1: scrub forbidden bylines. Step 2: strip street numbers.
  out = stripStreetNumbers(scrubForbiddenBylines(out));
  // Step 3 (ABSOLUTE LAST): inject contact + license footer if missing.
  if (withLicense) {
    out = appendLicenseFooter(out, license, byline);
    // Final deterministic guarantee — if for any reason the license line is
    // still absent (e.g. caller passed withLicense=true but the body was
    // pre-sanitized upstream), force-append the canonical 2-line footer.
    if (!FOOTER_RE.test(out) || !PHONE_RE.test(out)) {
      out = `${out.replace(/\s+$/g, "")}\n\n${buildFooterBlock(license)}`;
    }
  }
  return out;
}


/** Alias retained for callers that still reference the older name. */
export const sanitizeOutboundText = enforceOwnerLaws;

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

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
const OWNER_PHONE = "052-2973500";
const PHONE_RE = /052[\s\-]?297[\s\-]?3500/;
const CONTACT_LINE = `לפרטים נוספים, סרטון מהנכס ותיאום ביקור פרטי, אל תהססו לפנות אליי בוואטסאפ או בטלפון ישירות: 📞 ${OWNER_PHONE}`;

// HARD compliance constant. Udi's real broker license number — never replace
// with a placeholder, never read from env, never fall back to anything else.
const DEFAULT_OWNER_LICENSE = "3251676";

function buildFooterBlock(_license?: string | null): string {
  // License is HARDCODED — ignore any caller-supplied value.
  return `${CONTACT_LINE}\n\nרישיון תיווך מספר: ${DEFAULT_OWNER_LICENSE}`;
}

/**
 * Append the canonical owner footer (contact line + hardcoded license) at
 * the very bottom of `text`. The license number is ALWAYS Udi's real number
 * (3251676) — DB values and caller args are ignored.
 */
export function appendLicenseFooter(
  text: string,
  _license?: string | null,
  _byline?: string | null,
): string {
  const body = String(text ?? "").replace(/\s+$/g, "");
  if (!body) return body;

  // Strip any prior footer (placeholders, wrong numbers, "בהליך אימות", etc.)
  // so we can re-emit the canonical hardcoded line.
  let cleaned = body
    .replace(/\n*\s*רישיון\s*תיווך\s*מספר\s*[:：][^\n]*$/u, "")
    .replace(/\s+$/g, "");

  const hasContact = PHONE_RE.test(cleaned);
  const lines: string[] = [];
  if (!hasContact) lines.push(CONTACT_LINE);
  lines.push(`רישיון תיווך מספר: ${DEFAULT_OWNER_LICENSE}`);
  return `${cleaned}\n\n${lines.join("\n\n")}`;
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
  // Step 1: scrub forbidden bylines. Step 2: strip street numbers.
  let out = stripStreetNumbers(scrubForbiddenBylines(text));
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

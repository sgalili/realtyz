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

/** LAW #1 — strip building/house/apartment numbers from street addresses.
 *  Handles single-number ("ארלוזורוב 26"), multi-number tails
 *  ("אריה לייב יפה 36 2"), and comma-separated apt numbers
 *  ("ויצמן 4, דירה 12"). Runs iteratively until stable so every trailing
 *  numeric token attached to a street name is removed. */
export function stripStreetNumbers(input: string): string {
  let out = String(input ?? "");
  if (!out) return out;

  // A trailing run of one or more numeric tokens, each optionally followed by
  // a Hebrew letter suffix (e.g. "26א"), separated by spaces, slashes, or the
  // Hebrew "דירה"/"בית"/"כניסה" filler word. Anchored with \b so we don't
  // eat numbers that belong to legitimate units.
  const NUM = String.raw`\d{1,4}[א-ת]?`;
  const NUM_TAIL = String.raw`(?:\s*(?:\/|,\s*(?:דירה|בית|כניסה)\s*)?\s+${NUM})+\b`;

  // Pattern A: "<street-keyword> <hebrew name...> <numbers>" → drop numbers.
  const reA = new RegExp(
    `(${STREET_KEYWORD_GROUP})\\s+([\\u0590-\\u05FF][\\u0590-\\u05FF״"׳'\\-\\s]{1,60}?)${NUM_TAIL}`,
    "g",
  );
  out = out.replace(reA, (_m, kw, name) => `${kw} ${String(name).trim()}`);

  // Pattern C: labelled address ("כתובת:", "address:", "location:").
  out = out.replace(
    new RegExp(
      `(כתובת|address|location)\\s*[:：]\\s*([\\u0590-\\u05FF][\\u0590-\\u05FF\\s\\-״"׳']{1,60}?)${NUM_TAIL}`,
      "gi",
    ),
    (_m, label, name) => `${label}: ${String(name).trim()}`,
  );

  // Pattern B: bare "<hebrew word> <digit>" — but only when NOT followed by a
  // real unit (חדרים, מ"ר, קומה, ₪ …). Repeat until stable so we peel off
  // consecutive numeric tokens one at a time.
  const reB = /(^|[^\d:=״"׳'\u05F4\u05F3])([\u0590-\u05FF]{2,}(?:[\u0590-\u05FF״"׳'-]*[\u0590-\u05FF])?)\s+(\d{1,4})[א-ת]?\b/g;
  for (let i = 0; i < 6; i++) {
    const before = out;
    out = out.replace(reB, (m, pre, word, _num, offset, full) => {
      const after = String(full).slice(offset + m.length, offset + m.length + 24);
      if (TRAILING_UNITS.test(after.trim())) return m;
      if (/^(שנת|שנה|גיל|טלפון|נייד|מספר|דירה|קומה|בנין|בניין|פרויקט|פרוייקט|בן|בת)$/.test(word)) return m;
      return `${pre}${word}`;
    });
    if (out === before) break;
  }

  return out
    .replace(/\s+,/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1");
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

/**
 * Per-workspace signature. Built ONLY from the active workspace owner's own
 * profile — never from another workspace, never from a hardcoded broker.
 */
export type OwnerSignature = {
  name?: string | null;
  byline?: string | null;
  phone?: string | null;
  license?: string | null;
};

function buildFooterBlock(sig?: OwnerSignature | null): string {
  const name = String(sig?.name ?? "").trim();
  const byline = String(sig?.byline ?? "").trim();
  const phone = String(sig?.phone ?? "").trim();
  const license = String(sig?.license ?? "").trim();
  if (!name && !byline && !phone && !license) return "";
  const lines = ["לפרטים ולתיאום ביקור:"];
  if (name) lines.push(name);
  if (byline) lines.push(byline);
  if (phone) lines.push(`📞 ${phone}`);
  if (license) lines.push(`רישיון תיווך: ${license}`);
  return lines.join("\n");
}

/**
 * Append the canonical owner footer (strict 2-line block) at the very bottom
 * of `text`. Strips any prior contact lines, phone numbers, byline variants,
 * or license lines the AI may have produced so the final block is unique.
 */
export function appendLicenseFooter(
  text: string,
  signature?: OwnerSignature | null,
): string {
  const body = String(text ?? "").replace(/\s+$/g, "");
  if (!body) return body;

  // Strip every prior signature/contact variant so we emit ONE canonical block.
  let cleaned = body
    // old license lines
    .replace(/\n*\s*רישיון\s*תיווך\s*מספר\s*[:：][^\n]*/gu, "")
    .replace(/\n*\s*רישיון\s*תיווך\s*\d[^\n]*/gu, "")
    .replace(/\n*\s*ר\.?\s*מ\s*[:：][^\n]*/gu, "")
    // old contact/CTA lines the AI sometimes generates
    .replace(/\n*[^\n]*לקבלת\s+פרטים\s+נוספים[^\n]*/gu, "")
    .replace(/\n*[^\n]*לפרטים\s+נוספים[^\n]*/gu, "")
    .replace(/\n*[^\n]*תיאום\s+(?:סיור|ביקור|צפייה|צפיה)[^\n]*/gu, "")
    .replace(/\n*[^\n]*שלחו\s+הודעה\s+(?:או|ב)?\s*וו?ואטסאפ[^\n]*/gu, "")
    .replace(/\n*[^\n]*וו?ואטסאפ\s+או\s+בטלפון[^\n]*/gu, "")
    // bare phone numbers (with or without emoji prefix) — strip 05X prefixed contact lines
    .replace(/\n*\s*(?:📞|☎️|📱)?\s*0?5[0-9][\s\-]?\d{3}[\s\-]?\d{4}[^\n]*/gu, "")
    // any prior WhatsApp / שיחה טלפונית contact line the AI generated
    .replace(/\n*[^\n]*\bWhatsApp\b[^\n]*/gi, "")
    .replace(/\n*[^\n]*שיחה\s+טלפונית[^\n]*/gu, "")
    .replace(/\n*\s*(?:📞|☎️|📱)?\s*055[\s\-]?432[\s\-]?9729[^\n]*/gu, "")
    .replace(/בהליך\s*אימות/gu, "")
    // STRICT: AI-assisted watermark is forbidden — purge every variant.
    .replace(/,\s*תוכן\s*בסיוע\s*AI/giu, "")
    .replace(/תוכן\s*בסיוע\s*AI/giu, "")
    .replace(/,\s*AI[- ]assisted\s*content/giu, "")
    .replace(/AI[- ]assisted\s*content/giu, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+$/g, "");

  return `${cleaned}\n\n${OWNER_SIGNATURE_BLOCK}`;
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

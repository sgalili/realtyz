// ============================================================
// leadIntake
// ------------------------------------------------------------
// Natural-language → CRM lead extraction.
//
// The old inline regexes in `ai-agent` only matched a very narrow phrasing
// ("הוסף ליד בשם X עם 0541234567") which is why the assistant kept claiming
// "no phone number was provided" even though the owner clearly typed one.
// This module does three things properly:
//
//   1. Loose but validated Israeli phone detection (any separator style,
//      +972 / 972 / 0 prefixes, mobiles, 07X and landlines).
//   2. A structured LLM extraction pass (Gemini Flash, JSON out) that reads
//      the whole recent conversation and maps free text to CRM fields.
//   3. Deterministic regex extraction used both as a pre-fill and as a
//      fallback when the model call fails — the model can never remove a
//      phone number the regex already found.
// ============================================================

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const FAST_MODEL = "google/gemini-3-flash-preview";

export interface LeadDraft {
  full_name: string | null;
  phone: string | null; // normalized 9725XXXXXXXX
  email: string | null;
  city: string | null;
  neighborhood: string | null;
  deal_type: "sale" | "rent" | null;
  budget_max: number | null;
  rooms: number | null;
  requirements: string | null;
}

export const EMPTY_DRAFT: LeadDraft = {
  full_name: null, phone: null, email: null, city: null, neighborhood: null,
  deal_type: null, budget_max: null, rooms: null, requirements: null,
};

/** Normalize any Israeli phone shape to 972XXXXXXXXX, or null when invalid. */
export function normalizePhone(raw: string | null | undefined): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("972")) d = `0${d.slice(3)}`;
  if (!d.startsWith("0")) d = `0${d}`;
  const ok =
    /^05\d{8}$/.test(d) ||      // mobile
    /^07\d{8}$/.test(d) ||      // VoIP / virtual
    /^0[2-489]\d{7}$/.test(d) || // landline 9 digits
    /^0[2-489]\d{6}$/.test(d);   // short landline
  if (!ok) return null;
  return `972${d.slice(1)}`;
}

export function formatPhoneHe(normalized: string | null): string {
  if (!normalized) return "—";
  const local = normalized.startsWith("972") ? `0${normalized.slice(3)}` : normalized;
  return /^0[57]\d{8}$/.test(local) ? `${local.slice(0, 3)}-${local.slice(3)}` : local;
}

/**
 * Find the first valid Israeli phone number anywhere in free text, tolerating
 * spaces, dashes, dots, parentheses, "טלפון:" labels and +972 prefixes.
 */
export function extractPhoneLoose(text: string | null | undefined): string | null {
  const s = String(text ?? "");
  const candidates = s.match(/(?:\+?972|0)[\d\s\-.()]{6,16}\d/g) ?? [];
  for (const c of candidates) {
    const n = normalizePhone(c);
    if (n) return n;
  }
  // Last resort: any 9-10 digit run (e.g. "541234567" without the leading 0).
  for (const c of s.match(/\d{9,10}/g) ?? []) {
    const n = normalizePhone(c.length === 9 ? `0${c}` : c);
    if (n) return n;
  }
  return null;
}

const CITY_LIST = [
  "הרצליה", "רמת השרון", "תל אביב", "תל-אביב", "רמת גן", "רמת-גן", "רעננה", "כפר סבא",
  "נתניה", "חיפה", "ירושלים", "ראשון לציון", "חולון", "בת ים", "פתח תקווה", "גבעתיים",
  "אשדוד", "אשקלון", "באר שבע", "מודיעין", "רחובות", "הוד השרון", "גבעת שמואל",
  "כפר שמריהו", "רעננה", "צהלה", "סביון",
];

export function extractCityLoose(text: string | null | undefined): string | null {
  const s = String(text ?? "");
  for (const c of CITY_LIST) if (s.includes(c)) return c;
  const labelled = s.match(/(?:עיר|ב?אזור|city)\s*[:\-]?\s*([\u0590-\u05FF][\u0590-\u05FF' -]{2,25})/u);
  return labelled?.[1]?.trim() || null;
}

/**
 * Convert "3.5 מיליון" / "15,000" / "12 אלף" to shekels.
 *
 * The bare-number heuristic is deal-type aware: for a RENTAL, a small number
 * means thousands per month ("שכירות עד 15" → 15,000), never millions. Only a
 * purchase budget may be expanded to millions ("תקציב 3.5" → 3,500,000).
 */
function parseAmount(
  numText: string,
  unitText: string | undefined,
  dealType: "sale" | "rent" | null = null,
): number | null {
  const n = parseFloat(String(numText).replace(/,/g, ""));
  if (!isFinite(n) || n <= 0) return null;
  const unit = String(unitText ?? "");
  if (/מיליון|מיל׳|מיל'|m/i.test(unit)) return Math.round(n * 1_000_000);
  if (/אלף|k/i.test(unit)) return Math.round(n * 1_000);
  if (dealType === "rent") {
    // A monthly rent is thousands, not millions. 15 → 15,000; 15,000 stays.
    return n < 1_000 ? Math.round(n * 1_000) : Math.round(n);
  }
  if (n < 100) return Math.round(n * 1_000_000); // "תקציב 3.5" → 3.5M
  return Math.round(n);
}

/** Plausibility gate so a rent figure never lands as a purchase price. */
function sanitizeBudget(value: number | null, dealType: "sale" | "rent" | null): number | null {
  if (!value || value < 500) return null;
  if (dealType === "rent") {
    // Monthly rent above ~150k ILS is a mis-parse (usually a purchase figure).
    if (value > 150_000) return null;
    return value;
  }
  return value;
}

export function extractBudgetLoose(
  text: string | null | undefined,
  dealType: "sale" | "rent" | null = null,
): number | null {
  const s = String(text ?? "");
  const effectiveType = dealType ?? extractDealTypeLoose(s);
  const withLabel = s.match(
    /(?:תקציב|עד|מקסימום|budget|up\s*to)\D{0,12}?([\d.,]+)\s*(מיליון|מיל׳|מיל'|אלף|k|m)?/iu,
  );
  if (withLabel) {
    const v = sanitizeBudget(parseAmount(withLabel[1], withLabel[2], effectiveType), effectiveType);
    if (v) return v;
  }
  const CURRENCY = /(?:₪|ש["״'׳]{0,2}ח|שקלים|שקל|nis|ils)/;
  const shekel =
    s.match(new RegExp(`([\\d.,]+)\\s*(מיליון|מיל׳|מיל'|אלף|k|m)?\\s*${CURRENCY.source}`, "iu")) ??
    s.match(new RegExp(`${CURRENCY.source}\\s*([\\d.,]+)\\s*(מיליון|מיל׳|מיל'|אלף|k|m)?`, "iu"));
  if (shekel) {
    const v = sanitizeBudget(parseAmount(shekel[1], shekel[2], effectiveType), effectiveType);
    if (v) return v;
  }
  return null;
}

export function extractRoomsLoose(text: string | null | undefined): number | null {
  const m = String(text ?? "").match(/([\d.]+)\s*(?:חדרים|חד'|חד׳|חד\b|rooms?)/iu);
  const n = m ? parseFloat(m[1]) : NaN;
  return isFinite(n) && n > 0 && n < 15 ? n : null;
}

export function extractDealTypeLoose(text: string | null | undefined): "sale" | "rent" | null {
  const s = String(text ?? "");
  if (/שכירות|להשכרה|לשכור|שוכר|rent/i.test(s)) return "rent";
  if (/מכירה|למכירה|לקנות|לרכוש|רכישה|קנייה|sale|buy/i.test(s)) return "sale";
  return null;
}

/**
 * Words that are never part of a person's name. These are descriptors
 * ("לקוח פוטנציאלי חדש"), field labels, deal words and connectors. Anything
 * matching is dropped from a name candidate, and a candidate that starts with
 * one of them is scanned further to the right for the real name.
 */
const NAME_STOPWORDS =
  /^(חדש|חדשה|חדשים|חם|חמה|קר|קרה|פוטנציאלי|פוטנציאלית|פוטנציאלים|מעניין|מעניינת|רציני|רצינית|עם|של|את|בשם|שם|בעיר|מעיר|באזור|לשכירות|להשכרה|שכירות|למכירה|מכירה|לקנייה|לרכישה|טלפון|נייד|מספר|מייל|אימייל|תקציב|עד|חדרים|לקוח|לקוחה|לקוחות|מתעניין|מתעניינת|ליד|לידים|כרטיס|איש|אישה|קשר|בבקשה|תודה|new|hot|potential|client|clients|contact|contacts|lead|leads|customer|name|phone|budget|rent|rental|sale|buy)$/iu;

const NAME_TOKEN = /^[\p{L}][\p{L}'’\-]{1,25}$/u;

/** Keep only plausible name tokens, dropping descriptors and labels. */
function cleanNameTokens(candidate: string): string | null {
  const parts = candidate
    .split(/\s+/)
    .map((p) => p.replace(/^["'׳״,.:;-]+|["'׳״,.:;-]+$/g, ""))
    .filter((p) => p && NAME_TOKEN.test(p) && !NAME_STOPWORDS.test(p));
  if (!parts.length) return null;
  return parts.slice(0, 3).join(" ");
}

export function extractNameLoose(text: string | null | undefined): string | null {
  const s = String(text ?? "");
  // Widen each capture to up to 5 words so descriptors can be stripped and the
  // real name is still reached ("לקוח פוטנציאלי חדש משה ישראלי" → "משה ישראלי").
  const WORDS = `([\\p{L}][\\p{L}'’\\-]{1,25}(?:\\s+[\\p{L}][\\p{L}'’\\-]{1,25}){0,4})`;
  const patterns: RegExp[] = [
    // Explicit name marker wins: "בשם משה ישראלי", "שם מלא: משה ישראלי".
    new RegExp(`(?:בשם|שם\\s*מלא|שמו|שמה|full\\s*name|name)\\s*[:\\-]?\\s*${WORDS}`, "iu"),
    // Entity noun followed by descriptors and then the name.
    new RegExp(
      `(?:ליד|לידים|מתעניינ[תה]?|איש\\s*קשר|לקוח[הת]?|contact|lead|client|customer)\\s*[:,\\-–]?\\s*${WORDS}`,
      "iu",
    ),
    // Verb-first phrasing without any noun: "תוסיף את משה ישראלי 0541234567".
    new RegExp(
      `(?:הוסף|תוסיף|הוסיפי|תוסיפי|תכניס|תכניסי|צור|תיצור|תיצרי|רשום|תרשום|שמור|תשמור|add|create|save)\\s*(?:את|for)?\\s*${WORDS}`,
      "iu",
    ),
  ];
  for (const re of patterns) {
    const cand = s.match(re)?.[1]?.trim();
    if (!cand) continue;
    const cleaned = cleanNameTokens(cand);
    if (cleaned) return cleaned;
  }
  return null;
}

export function extractEmailLoose(text: string | null | undefined): string | null {
  return String(text ?? "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
}

/** Deterministic pass over the raw text. */
export function extractLeadDraftRegex(text: string): LeadDraft {
  return {
    full_name: extractNameLoose(text),
    phone: extractPhoneLoose(text),
    email: extractEmailLoose(text),
    city: extractCityLoose(text),
    neighborhood: null,
    deal_type: extractDealTypeLoose(text),
    budget_max: extractBudgetLoose(text),
    rooms: extractRoomsLoose(text),
    requirements: null,
  };
}

/** Intent verbs/nouns, checked independently so word order does not matter. */
const VERB_RE = /(הוסף|תוסיף|הוסיפי|תוסיפי|תכניס|תכניסי|צור|תיצור|תיצרי|רשום|תרשום|שמור|תשמור|פתח|תפתח|add|create|new|save|register)/i;
const NOUN_RE = /(ליד|לידים|מתעניין|מתעניינת|איש\s*קשר|לקוח[הת]?|כרטיס|crm|contact|lead|client)/i;

/**
 * Does this conversation ask to create a lead?
 * Looks at the last few user turns (so "add a client" followed by a bare
 * phone number in the next message still counts) and also treats a message
 * that is essentially "name + phone" right after the assistant asked for a
 * phone number as a create-lead continuation.
 */
export function detectCreateLeadIntent(
  messages: Array<{ role: string; content: string }>,
): boolean {
  const userTurns = messages.filter((m) => m.role === "user").map((m) => String(m.content ?? ""));
  const recent = userTurns.slice(-4);
  for (const t of recent) {
    if (VERB_RE.test(t) && NOUN_RE.test(t)) return true;
  }
  const last = userTurns[userTurns.length - 1] ?? "";
  if (!extractPhoneLoose(last)) return false;
  // Assistant just asked for a phone number to add the contact.
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "";
  if (/(טלפון|נייד|phone)/i.test(String(lastAssistant)) && NOUN_RE.test(String(lastAssistant))) return true;
  // Earlier turn asked to add someone, this turn supplies the details.
  return recent.slice(0, -1).some((t) => VERB_RE.test(t) && NOUN_RE.test(t));
}

/** Join the recent conversation into one extraction blob. */
export function collectIntakeText(
  messages: Array<{ role: string; content: string }>,
  turns = 6,
): string {
  return messages
    .slice(-turns)
    .filter((m) => m.role === "user")
    .map((m) => String(m.content ?? ""))
    .join("\n");
}

/** Structured LLM extraction. Returns null on any failure. */
export async function extractLeadDraftLLM(text: string): Promise<Partial<LeadDraft> | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey || !text.trim()) return null;
  const system = `אתה מחלץ נתונים ל-CRM נדל"ן ישראלי. קבל טקסט חופשי בעברית או אנגלית והחזר JSON בלבד.
מפתחות: full_name, phone, email, city, neighborhood, deal_type ("sale" או "rent"), budget_max (מספר שקלים), rooms (מספר), requirements (תמצית דרישות במשפט אחד).
חוקים:
- full_name: שם פרטי ומשפחה של האדם עצמו בלבד. אסור לכלול תארים או תוספות תיאוריות כמו "לקוח", "לקוחה", "לקוח פוטנציאלי", "ליד", "מתעניין", "איש קשר", "חדש", "חם", "רציני". לדוגמה: "תוסיף לקוח פוטנציאלי חדש משה ישראלי" → full_name = "משה ישראלי". אם לא נאמר שם אמיתי של אדם, החזר null (אל תחזיר "לקוח חדש").
- phone: החזר בדיוק כפי שנכתב, כולל מקפים. אם אין טלפון בטקסט החזר null.
- deal_type: "rent" אם מדובר בשכירות/להשכרה/שוכר, "sale" אם מדובר ברכישה/קנייה/מכירה. אם לא ברור, null.
- budget_max: תמיד סכום בשקלים בשדה הזה, גם לשכירות (תקציב חודשי) וגם לרכישה.
  * שכירות: הסכום הוא שכר דירה חודשי. "עד 15,000 ש״ח" → 15000. "עד 15 אלף" → 15000. "עד 12" → 12000. אסור להמיר למיליונים בשכירות.
  * רכישה: "2 מיליון" → 2000000, "3.5" → 3500000, "עד 4.2 מיליון" → 4200000.
- אל תמציא נתונים. שדה שלא הופיע בטקסט = null.
- החזר JSON נקי, בלי markdown ובלי הסברים.`;
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: FAST_MODEL,
        temperature: 0,
        messages: [{ role: "system", content: system }, { role: "user", content: text.slice(0, 4000) }],
      }),
    });
    if (!res.ok) return null;
    const raw = String((await res.json())?.choices?.[0]?.message?.content ?? "");
    const jsonText = raw.replace(/```(?:json)?/gi, "").trim();
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(jsonText.slice(start, end + 1));
    const num = (v: unknown) => {
      const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^\d.]/g, ""));
      return isFinite(n) && n > 0 ? n : null;
    };
    const str = (v: unknown) => {
      const s = String(v ?? "").trim();
      return s && !/^(null|undefined|-|—)$/i.test(s) ? s : null;
    };
    return {
      full_name: str(parsed.full_name),
      phone: normalizePhone(str(parsed.phone) ?? ""),
      email: str(parsed.email),
      city: str(parsed.city),
      neighborhood: str(parsed.neighborhood),
      deal_type: parsed.deal_type === "rent" ? "rent" : parsed.deal_type === "sale" ? "sale" : null,
      budget_max: num(parsed.budget_max),
      rooms: num(parsed.rooms),
      requirements: str(parsed.requirements),
    };
  } catch (_e) {
    return null;
  }
}

/**
 * Full extraction: regex first (never lost), LLM fills the gaps and adds the
 * requirements summary. Deterministic values win on conflict for phone.
 */
export async function extractLeadDraft(text: string): Promise<LeadDraft> {
  const base = extractLeadDraftRegex(text);
  const llm = await extractLeadDraftLLM(text);
  if (!llm) return base;
  const pick = <K extends keyof LeadDraft>(k: K): LeadDraft[K] =>
    (base[k] ?? (llm[k] as LeadDraft[K] | undefined) ?? null) as LeadDraft[K];
  return {
    full_name: pick("full_name"),
    // Regex phone is authoritative; the model is only a fallback.
    phone: base.phone ?? (llm.phone ?? null),
    email: pick("email"),
    city: pick("city"),
    neighborhood: (llm.neighborhood ?? null) as string | null,
    deal_type: base.deal_type ?? (llm.deal_type ?? null),
    budget_max: base.budget_max ?? (llm.budget_max ?? null),
    rooms: base.rooms ?? (llm.rooms ?? null),
    requirements: (llm.requirements ?? null) as string | null,
  };
}

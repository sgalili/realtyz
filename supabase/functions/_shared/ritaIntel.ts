// ============================================================
// ritaIntel — deterministic helpers shared by every Rita channel.
//  1. resolveFocusListing: the ONE property a conversation is about.
//  2. answerPropertyFact: answers "how many rooms / floor / price / size"
//     straight from the listing row, no model involved.
//  3. isRepeatReply: blocks resending a reply or question already sent.
//  4. Qualification state (leads.preferences.rita_state): which topics Rita
//     already asked about and which the contact already answered.
// ============================================================
import { FOCUS_COLUMNS, matchListingFromText, textNamesAddress, type FocusRow } from "./focusProperty.ts";
export { ADDRESS_NOT_FOUND_BLOCK, textNamesAddress } from "./focusProperty.ts";

type Admin = { from: (table: string) => any };
type Msg = { role: string; content: string };

export async function resolveFocusListing(
  admin: Admin,
  ownerId: string | null | undefined,
  currentText: string,
  history: Msg[],
  fallbackListingId?: string | null,
): Promise<FocusRow | null> {
  try {
    if (ownerId) {
      const now = await matchListingFromText(admin, ownerId, currentText);
      if (now) return now;
      // A concrete address that is not ours must never fall back to another property.
      if (textNamesAddress(currentText)) return null;
      const prior = history
        .filter((m) => m.role === "user")
        .slice(-8)
        .map((m) => String(m.content ?? ""))
        .reverse()
        .join("\n");
      if (prior) {
        const hit = await matchListingFromText(admin, ownerId, prior);
        if (hit) return hit;
      }
    }
    if (fallbackListingId && /^[0-9a-f-]{36}$/i.test(fallbackListingId)) {
      const { data } = await admin.from("listings").select(FOCUS_COLUMNS).eq("id", fallbackListingId).maybeSingle();
      return (data as FocusRow) ?? null;
    }
  } catch (_) { /* soft-fail */ }
  return null;
}

const FACTS: Array<{ key: string; re: RegExp; render: (l: any) => string | null }> = [
  { key: "rooms", re: /כמה\s+חדר|מספר\s+(ה)?חדרים|\brooms?\b/i, render: (l) => l.rooms ? `בנכס יש ${l.rooms} חדרים` : null },
  { key: "floor", re: /(באיזו|איזה|מה\s+ה?)\s*קומה|קומה\s*\?|\bfloor\b/i, render: (l) => l.floor !== null && l.floor !== undefined && l.floor !== "" ? `הנכס נמצא בקומה ${l.floor}` : null },
  { key: "price", re: /כמה\s+(זה\s+)?(עולה|עולָה)|מה\s+ה?מחיר|מחיר\s*\?|\bprice\b/i, render: (l) => l.asking_price ? `המחיר המבוקש הוא ${Number(l.asking_price).toLocaleString("he-IL")} ש"ח` : null },
  { key: "size", re: /כמה\s+(מטר|מ"ר|מ״ר)|מה\s+ה?(גודל|שטח)|\bsqm\b|\bsize\b/i, render: (l) => l.sqm ? `שטח הנכס ${l.sqm} מ"ר` : null },
];

/** Deterministic answer for direct fact questions about the property in focus. */
export function answerPropertyFact(text: string, row: FocusRow | null): string | null {
  if (!row || !text) return null;
  const l = row as any;
  const parts = FACTS.filter((f) => f.re.test(text)).map((f) => f.render(l)).filter(Boolean) as string[];
  if (!parts.length) return null;
  const place = [l.address, l.house_number].filter(Boolean).join(" ");
  const lead = place ? `לגבי ${place}${l.city ? `, ${l.city}` : ""}: ` : "";
  return `${lead}${parts.join(", ")}.`;
}

const normalize = (v: string) => String(v ?? "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** True when `reply` equals an earlier assistant turn or re-asks its closing question. */
export function isRepeatReply(reply: string, history: Msg[]): boolean {
  if (!reply) return false;
  const prior = history.filter((m) => m.role === "assistant").slice(-12).map((m) => normalize(m.content));
  const whole = normalize(reply);
  const q = normalize((reply.match(/[^.!?\n]*\?/g) ?? []).pop() ?? "");
  return prior.some((p) => p === whole || (q.length > 12 && p.includes(q)));
}

// ---------- qualification state ----------
const TOPICS: Array<{ key: string; label: string; ask: RegExp; answer: RegExp }> = [
  { key: "budget", label: "תקציב", ask: /תקציב|טווח\s+מחיר/, answer: /(\d[\d,.]*\s*(אלף|מיליון|מליון|k|₪|ש"ח))|תקציב/i },
  { key: "rooms", label: "מספר חדרים", ask: /כמה\s+חדרים\s+(את|אתה|אתם)|מספר\s+חדרים/, answer: /\d(\.\d)?\s*חדר/ },
  { key: "area", label: "אזור", ask: /איזה\s+אזור|באיזו\s+עיר|איזו\s+שכונה/, answer: /\bב(תל\s?אביב|הרצליה|רעננה|כפר\s?סבא|רמת\s?גן|נתניה)|שכונ/ },
  { key: "timing", label: "מועד כניסה", ask: /מתי\s+(תרצ|תרצו|תרצה|אתם\s+מתכננ)|מועד\s+כניסה/, answer: /מיידי|חודש|שבוע|בעוד|כניסה/ },
  { key: "viewing", label: "תיאום סיור", ask: /סיור|לראות\s+את\s+הנכס|ביקור/, answer: /סיור|לראות|מתי\s+אפשר|מחר|היום/ },
];

export type RitaState = { asked: string[]; answered: string[] };

export function readRitaState(preferences: unknown): RitaState {
  const s = (preferences as any)?.rita_state ?? {};
  return { asked: Array.isArray(s.asked) ? s.asked : [], answered: Array.isArray(s.answered) ? s.answered : [] };
}

/** Prompt block telling Rita what she must not ask again. */
export function renderRitaStateBlock(state: RitaState): string {
  const label = (k: string) => TOPICS.find((t) => t.key === k)?.label ?? k;
  const lines: string[] = [];
  if (state.answered.length) lines.push(`כבר נענה על ידי איש הקשר (אסור לשאול שוב): ${state.answered.map(label).join(", ")}`);
  const pending = state.asked.filter((k) => !state.answered.includes(k));
  if (pending.length) lines.push(`כבר נשאל ולא נענה (אל תחזרי על השאלה, המשיכי בשיחה): ${pending.map(label).join(", ")}`);
  return lines.length ? `\n\n[מצב סינון]\n${lines.join("\n")}` : "";
}

/** Updates leads.preferences.rita_state from the inbound text and the reply sent. */
export async function saveRitaState(
  admin: Admin,
  leadId: string,
  preferences: unknown,
  inbound: string,
  reply: string,
): Promise<void> {
  try {
    const state = readRitaState(preferences);
    const answered = new Set(state.answered);
    const asked = new Set(state.asked);
    for (const t of TOPICS) {
      if (t.answer.test(inbound)) answered.add(t.key);
      if (t.ask.test(reply) && /\?/.test(reply)) asked.add(t.key);
    }
    if (answered.size === state.answered.length && asked.size === state.asked.length) return;
    const prefs = { ...((preferences as Record<string, unknown>) ?? {}), rita_state: { asked: [...asked], answered: [...answered], updated_at: new Date().toISOString() } };
    await admin.from("leads").update({ preferences: prefs }).eq("id", leadId);
  } catch (_) { /* soft-fail */ }
}

// ---------- inquiry intent ----------
// Product = asking about Realtyz itself (the tool, how it works, the marketing post).
// Property = explicit wish to buy / rent / sell / let a property.
const PRODUCT_RE = /realty\s?z|ריאלטי\s?ז|ריאלטיז|הכלי|המערכת|האפליקציה|התוכנה|איך\s+(זה|הכלי|המערכת)\s+עובד|איך\s+זה\s+עובד|הדגמה|דמו|\bdemo\b|מנוי|כמה\s+עולה\s+(המערכת|הכלי|המנוי)|למתווכים|אוטומציה|ראיתי\s+את\s+הפוסט|לגבי\s+הפוסט|על\s+הפוסט/i;
const PROPERTY_RE = /(מחפש|מחפשת|מחפשים|רוצה|רוצים|מעוניין|מעוניינת|מעוניינים)\s+(ל)?(לקנות|קנות|לשכור|לשכירות|לרכוש|דירה|בית|נכס|למכור|להשכיר)|לקנות\s+דירה|לשכור\s+דירה|למכור\s+(את\s+)?(ה)?(דירה|בית|נכס)|להשכיר\s+(את\s+)?(ה)?(דירה|בית|נכס)|דירת\s+\d|\d(\.\d)?\s*חדרים|תקציב\s+של|עד\s+\d[\d,.]*\s*(אלף|מיליון|מליון|₪|ש"ח)|יש\s+לי\s+(דירה|נכס|בית)\s+(למכירה|להשכרה)/i;

export type InquiryIntent = "product" | "property" | "unknown";

/** Deterministic intent: explicit property wishes win; otherwise Realtyz/tool questions are product inquiries. */
export function classifyInquiryIntent(text: string, history: Msg[] = []): InquiryIntent {
  const t = String(text ?? "");
  if (PROPERTY_RE.test(t)) return "property";
  if (PRODUCT_RE.test(t)) return "product";
  // Follow-ups ("כן", "מעניין") inherit the thread: last contact turns about the product.
  const prior = history.filter((m) => m.role === "user").slice(-4).map((m) => String(m.content ?? "")).join("\n");
  if (PROPERTY_RE.test(prior)) return "property";
  if (PRODUCT_RE.test(prior)) return "product";
  return "unknown";
}

/** Prompt block forcing the Realtyz product answer (no buyer qualification). */
export const PRODUCT_INQUIRY_BLOCK =
  "\n\n[INTENT: REALTYZ PRODUCT INQUIRY] איש הקשר שואל על Realtyz עצמה (הכלי, איך זה עובד, הפוסט השיווקי), לא על נכס. " +
  "אסור לשאול על חדרים, תקציב, אזור, מועד כניסה או סיור. הסבירי בקצרה ש-Realtyz היא מערכת AI לשיווק ואוטומציית קמפיינים למתווכי נדל\"ן: " +
  "פרסום בקבוצות ובעמודים, מענה אוטומטי לפניות מסביב לשעון, ניהול אנשי קשר ונכסים במקום אחד. סיימי בהזמנה ידידותית להדגמה קצרה בזום.";

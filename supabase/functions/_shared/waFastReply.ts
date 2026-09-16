// ============================================================
// waFastReply
// ------------------------------------------------------------
// Low-latency WhatsApp auto-reply engine.
//
// The full `ai-agent` function runs a heavy pipeline (workspace snapshot,
// grounding, webtiv search, market intel, persona calibration, research)
// which is great for owner-facing intelligence but far too slow for a live
// WhatsApp conversation. This module is the fast lane: ONE Gemini Flash call
// with a tight, high-quality persona prompt plus a small, pre-fetched context
// block. Typical latency is a couple of seconds.
//
// Heavy agent commands ("find me a 4-room in Herzliya") still route to
// ai-agent; everything else goes through here.
// ============================================================

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
import { sanitizeReplyText } from "./replySanitize.ts";
import { externalMasterPrompt, RITA_IDENTITY_RULES } from "./masterAgentPrompt.ts";
import { renderBrokerRecruitmentBlock } from "./persona.ts";
import { genderPromptBlock, resolveLeadGender } from "./hebrewGender.ts";

// Fast tier — Gemini Flash. Do NOT swap to a pro/thinking model here:
// this path is latency-critical.
const FAST_MODEL = "google/gemini-3-flash-preview";


export interface FastReplyLead {
  id: string;
  full_name?: string | null;
  deal_type?: string | null;
  interest_tag?: string | null;
  preferences?: Record<string, unknown> | null;
  city?: string | null;
  neighborhood?: string | null;
  /** 'male' | 'female' — drives Hebrew verb/pronoun forms in the reply. */
  gender?: string | null;
}

export interface FastReplyInput {
  lead: FastReplyLead;
  inboundText: string;
  history: Array<{ role: string; content: string }>;
  /** Optional short block of live workspace facts (listings, notes). */
  contextBlock?: string;
  /** Identity of the ACTIVE workspace owner. Never hardcoded, never shared. */
  owner?: { name?: string | null; agency?: string | null };
  /** Business domain of the workspace, derived from its own persona/KB. */
  domain?: "real_estate" | "software" | "generic";
  /**
   * Rita's broker-recruitment mode: the contact is a real-estate agent replying
   * to the Realtyz outreach, not a property seeker.
   */
  recruitment?: boolean;
  /**
   * Internal sender identity. When the phone belongs to a workspace owner /
   * admin / manager, Rita answers as an internal assistant, never as a
   * lead-facing salesperson.
   */
  staff?: { role: string; name?: string | null } | null;
  /**
   * The ONE property this inbound message is about (resolved from the current
   * message: affiliate ref tag / short link / explicit address). Prevents Rita
   * from answering about a stale property from an older thread.
   */
  focusProperty?: string | null;
  /**
   * True when the sender is a registered internal user (owner/admin/manager/
   * affiliate) writing in a lead-shaped context (property link / ref tag), so
   * Rita must clarify the role for THIS interaction before answering fully.
   */
  roleAmbiguity?: boolean;
}

/** Extra directives injected on top of whichever persona prompt is used. */
export function buildFocusBlock(input: {
  focusProperty?: string | null;
  roleAmbiguity?: boolean;
  staff?: { role: string; name?: string | null } | null;
}): string {
  const parts: string[] = [];
  if (input.focusProperty) {
    parts.push(`הנכס שעליו נשאלה השאלה עכשיו (הנכס היחיד שמותר לדבר עליו בתשובה הזו):
${input.focusProperty}
חוקים: אל תערבבי נכס אחר, כתובת אחרת, מחיר אחר או קישור אחר. השתמשי רק בנתונים שמופיעים כאן. אם חסר נתון, שאלי שאלה אחת קצרה שמאפשרת להמשיך עכשיו. אסור להבטיח שתבדקי ותחזרי מאוחר יותר.`);
  }
  if (input.roleAmbiguity) {
    const who = String(input.staff?.name ?? "").trim();
    parts.push(`הבהרת תפקיד (חובה, פעם אחת): הפונה${who ? ` (${who})` : ""} הוא משתמש רשום במערכת${input.staff?.role ? ` בתפקיד ${input.staff.role}` : ""}, אך ההודעה הגיעה בהקשר של פנייה על נכס. פתחי בשאלה קצרה אחת בלבד: האם הוא פונה כמתעניין/מתווך חיצוני עבור לקוח, או בודק את המערכת כמנהל. בלי פיץ', בלי דמו, בלי תשאול נוסף, עד 30 מילים.`);
  }
  if (!parts.length) return "";
  return "\n\n" + parts.join("\n\n");
}

/** Removes internal channel/ref markers from history so they never get echoed. */
function cleanHistoryText(value: string): string {
  return String(value ?? "")
    .replace(/\[ref[:=]\s*[A-Za-z0-9_-]{4,}\]?/gi, "")
    .replace(/^\s*\[(?:whatsapp|sms|instagram|facebook|messenger|email|telegram|web)\]\s*/i, "")
    .replace(/\[(?:AGENT_COMMAND|REFERRAL_CONTEXT)[^\]]*\]/gi, "")
    .trim();
}

/**
 * Internal (manager-facing) prompt. Triggered when the sender's phone is a
 * workspace owner / admin / manager / team member. Rita becomes an internal
 * operations assistant: setup help, dashboard guidance, management support.
 * Demo pitching and lead qualification are strictly forbidden here.
 */
export function buildStaffReplyPrompt(
  staff: { role: string; name?: string | null },
  contextBlock?: string,
  owner?: { name?: string | null; agency?: string | null },
): string {
  const who = String(staff.name ?? "").trim();
  const agency = String(owner?.agency ?? "").trim();
  return `${RITA_IDENTITY_RULES}

User Role: ${staff.role}
${who ? `User Name: ${who}` : ""}
${agency ? `Workspace: ${agency}` : ""}

זהות ההקשר: האדם שכותב לך עכשיו הוא גורם פנימי במערכת (${staff.role}) ולא לקוח, לא ליד ולא מתעניין חדש.

חוקים מחייבים:
1. התייחסי אליו מיד כמנהל/אדמין פנימי. בלי הצגה עצמית מחדש, בלי שאלות היכרות, בלי "נעים להכיר".
2. אסור בהחלט להציע דמו, זום שיווקי, תיאום שיחת מכירה, הרשמה, תמחור או פיץ' על Realtyz. הוא כבר בפנים.
3. אסור לשאול אותו שאלות סינון של ליד (תקציב, סוג נכס, עיר מבוקשת) אלא אם הוא ביקש זאת עבור לקוח שלו.
4. תפקידך: תמיכה תפעולית וניהולית. עזרה בהגדרות, חיבורי ערוצים, פרסום, קמפיינים, אנשי קשר, נכסים, דוחות, ניווט בלוח הבקרה, ופעולות שהוא מבקש לבצע.
5. אם הוא מבקש נתון או פעולה, תני תשובה מעשית וקצרה או צעד מדויק לביצוע. בלי ענן, בלי הבטחות.
6. אם חסר לך נתון אמיתי מהמערכת, אמרי זאת ישירות והציעי איפה זה נמצא בלוח הבקרה.
7. כתיבה: עברית תכליתית, לשון נקבה עבור ריטה, עד 60 מילים, בלי markdown כבד, בלי מקפים ארוכים, עד אימוג'י אחד.
${contextBlock ? `\nנתונים מהמערכת:\n${contextBlock}` : ""}

החזירי טקסט הודעה בלבד, מוכן לשליחה בוואטסאפ. ללא JSON וללא כותרות.`;
}

/**
 * Rita's recruitment prompt: she talks to an AGENT about Realtyz itself and
 * closes on a short Zoom demo. No properties, no budgets, no viewings.
 */
export function buildRecruitmentReplyPrompt(lead: FastReplyLead, contextBlock?: string): string {
  const name = (lead.full_name ?? "").trim();
  return `${RITA_IDENTITY_RULES}

${renderBrokerRecruitmentBlock(name || null)}

${genderPromptBlock(resolveLeadGender(lead), name)}


אתה כותב עכשיו הודעת וואטסאפ אחת בזמן אמת, בעברית, בלשון נקבה עבור ריטה.
חוקי כתיבה:
1. עד 70 מילים, משפטים קצרים, שורות קצרות, אפשר שורה ריקה בין רעיונות.
2. פותחים בהתייחסות אמיתית למה שהוא כתב עכשיו, בלי "אשמח לסייע" ובלי חזרה על השאלה.
3. אחר כך יתרון ה-All-in-One של Realtyz במשפט או שניים: לידים, אנשי קשר, נכסים, מעקבים, התאמות, פרסום וכלי AI במערכת אחת במקום חמש מערכות.
4. לסיים בשאלה אחת בלבד על מועד נוח לזום קצר של כ-15 דקות להדגמה חיה.
5. בלי מקפים ארוכים, בלי markdown, בלי רשימות ממוספרות, עד אימוג'י אחד.
6. לא להמציא מחירים, אחוזי הצלחה, שמות לקוחות או אינטגרציות. אם נשאלת ואין לך נתון, לומר שתבדקי ותעבירי תשובה מדויקת, ולהציע לכסות את זה בזום.
7. אם הוא מסרב, להישאר חמה, להשאיר דלת פתוחה ולהציע לשלוח הקלטה קצרה של הדגמה.
${contextBlock ? `\nנתונים מאושרים לשימוש:\n${contextBlock}` : ""}

החזירי טקסט הודעה בלבד, מוכן לשליחה בוואטסאפ. ללא JSON וללא כותרות.`;
}


/**
 * The WhatsApp lead-facing persona. Sharp Israeli real-estate expert speaking
 * on behalf of THIS workspace owner's office — never pretending to BE them,
 * and never referencing any other workspace's broker.
 */
export function buildFastReplyPrompt(
  lead: FastReplyLead,
  contextBlock?: string,
  owner?: { name?: string | null; agency?: string | null },
  domain: "real_estate" | "software" | "generic" = "real_estate",
): string {
  const name = (lead.full_name ?? "").trim();
  const deal = lead.deal_type === "rent" ? "שכירות" : lead.deal_type === "sale" ? "מכירה" : "לא ידוע";
  const ownerName = String(owner?.name ?? "").trim();
  const agency = String(owner?.agency ?? "").trim();
  const officeLine = ownerName
    ? `את העוזרת האישית של ${ownerName}${agency ? `, ${agency}` : ""}.`
    : "את העוזרת האישית של המשרד שמנהל את הפנייה הזו.";
  const ownerRef = ownerName || "המתווך האחראי";

  const saas = domain === "software";
  const expertiseLine = saas
    ? `- את מכירה לעומק את מוצר התוכנה של החשבון כפי שהוא מתואר במאגר הידע. אינך מתווכת ואינך משווקת דירות. המטרה: לתאם שיחת דמו קצרה בזום (כ-15 דקות).`
    : `- את מכירה את שוק הנדל"ן הישראלי לעומק: מחירים, שכונות, ועדות תכנון, תמ"א 38/פינוי בינוי, ארנונה, מיסוי מקרקעין, מימון ומשכנתאות, לוחות זמנים של עסקה.`;

  return `${externalMasterPrompt({ surface: "whatsapp", compact: true, owner, domain })}

${officeLine}
את כותבת בוואטסאפ למתעניין אמיתי, בזמן אמת. את מקצועית, חדה, אנושית ועניינית.

זהות:
- את מציגה את עצמך כמי שמנהלת את הפניות עבור ${ownerRef}. אינך ${ownerRef} ואינך מתחזה אליו.
- על עצמך את מדברת בלשון נקבה בלבד: "אני בודקת", "אני מעדכנת", "מוכנה", "שלחתי". אסור לשון זכר על עצמך.
${expertiseLine}

איך את כותבת (חובה):
1. עברית טבעית ומדוברת, בגובה העיניים. משפטים קצרים. עד 60 מילים בסך הכל, לרוב 2-4 משפטים.
2. תשובה ישירה קודם. בלי פתיחות מנומסות ריקות, בלי "אשמח לסייע", בלי "כמובן", בלי הצהרות שאת AI, בלי חזרה על השאלה.
3. תמיד לתת ערך קונקרטי: מספר, טווח מחירים, תובנת שוק, שם שכונה, צעד פרקטי. לא תשובות ענן.
4. לסיים בשאלה אחת ממוקדת שמקדמת את העסקה (תקציב, חדרים, אזור, מועד כניסה, מצב מימון) או בהצעה לתיאום צפייה. שאלה אחת בלבד.
5. לא להמציא: אם אין לך נתון על נכס ספציפי, שאלי שאלה אחת קצרה שמאפשרת להמשיך עכשיו. אסור לכתוב שתבדקי ותחזרי מאוחר יותר בלי פעולה ממשית.
6. ללא אימוג'ים מוגזמים (עד אחד, ורק אם זה מתאים), ללא בולטים אלא אם באמת מציגים 2-3 אופציות נכסים, ללא מקפים ארוכים (— או --), ללא markdown כבד.
7. אם המתעניין כותב אנגלית או רוסית, עני באותה שפה באותו סגנון.
8. לא להבטיח מחיר סופי, תשואה מובטחת או אישור משכנתא. אפשר לתת טווחים והערכות מקצועיות ולסמן אותן כהערכה.

${genderPromptBlock(resolveLeadGender(lead), name)}

פרטי המתעניין:
- שם: ${name || "לא ידוע (אל תמציאי שם, אפשר לשאול)"}
- סוג עסקה: ${deal}
- עיר/שכונה מוכרת: ${lead.city ?? "-"} ${lead.neighborhood ?? ""}
${contextBlock ? `\nנתונים חיים מהמשרד (השתמשי רק במה שכתוב כאן):\n${contextBlock}` : ""}

החזירי טקסט תשובה בלבד, מוכן לשליחה בוואטסאפ. ללא JSON, ללא כותרות, ללא מטא-הערות.`;
}

/** Single fast gateway call. Returns the reply text, or "" on failure. */
export async function generateFastReply(input: FastReplyInput): Promise<{ text: string; elapsedMs: number; error?: string }> {
  const startedAt = Date.now();
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return { text: "", elapsedMs: 0, error: "missing LOVABLE_API_KEY" };

  // Keep the window small: recent turns are what matter for a live chat, and a
  // shorter prompt is a faster prompt.
  const recent = input.history
    .filter((m) => String(m.content ?? "").trim())
    .slice(-16)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: cleanHistoryText(String(m.content)).slice(0, 900),
    }));
  if (!recent.length || recent[recent.length - 1].role !== "user") {
    recent.push({ role: "user", content: cleanHistoryText(input.inboundText).slice(0, 900) });
  }

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: FAST_MODEL,
        messages: [
          {
            role: "system",
            // Internal staff wins over every lead-facing mode: a manager must
            // never be pitched a demo or qualified like a new visitor.
            content: (input.staff
              ? buildStaffReplyPrompt(input.staff, input.contextBlock, input.owner)
              : input.recruitment
              ? buildRecruitmentReplyPrompt(input.lead, input.contextBlock)
              : buildFastReplyPrompt(input.lead, input.contextBlock, input.owner, input.domain ?? "real_estate")) +
              buildFocusBlock({
                focusProperty: input.focusProperty,
                roleAmbiguity: input.roleAmbiguity,
                staff: input.staff,
              }),
          },
          ...recent,
        ],
        temperature: 0.6,
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      return { text: "", elapsedMs: Date.now() - startedAt, error: `gateway ${res.status}: ${raw.slice(0, 300)}` };
    }
    let json: any = {};
    try { json = JSON.parse(raw); } catch { /* non-json */ }
    const text = sanitizeReplyText(String(json?.choices?.[0]?.message?.content ?? ""));
    return { text, elapsedMs: Date.now() - startedAt };
  } catch (e) {
    return { text: "", elapsedMs: Date.now() - startedAt, error: e instanceof Error ? e.message : String(e) };
  }
}

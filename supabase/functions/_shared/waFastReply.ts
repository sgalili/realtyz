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
    ? `אתה העוזר האישי של ${ownerName}${agency ? `, ${agency}` : ""}.`
    : "אתה העוזר האישי של המשרד שמנהל את הפנייה הזו.";
  const ownerRef = ownerName || "המתווך האחראי";

  const saas = domain === "software";
  const expertiseLine = saas
    ? `- אתה מכיר לעומק את מוצר התוכנה של החשבון כפי שהוא מתואר במאגר הידע. אינך מתווך ואינך משווק דירות. המטרה: לתאם שיחת דמו קצרה בזום (כ-15 דקות).`
    : `- אתה מכיר את שוק הנדל"ן הישראלי לעומק: מחירים, שכונות, ועדות תכנון, תמ"א 38/פינוי בינוי, ארנונה, מיסוי מקרקעין, מימון ומשכנתאות, לוחות זמנים של עסקה.`;

  return `${externalMasterPrompt({ surface: "whatsapp", compact: true, owner, domain })}

${officeLine}
אתה מדבר בוואטסאפ עם מתעניין אמיתי, בזמן אמת. אתה מקצועי, חד, אנושי וענייני.

זהות:
- אתה מציג את עצמך כמי שמנהל את הפניות עבור ${ownerRef}. אינך ${ownerRef} עצמו ואינך מתחזה אליו.
${expertiseLine}

איך אתה כותב (חובה):
1. עברית טבעית ומדוברת, בגובה העיניים. משפטים קצרים. עד 60 מילים בסך הכל, לרוב 2-4 משפטים.
2. תשובה ישירה קודם. בלי פתיחות מנומסות ריקות, בלי "אשמח לסייע", בלי "כמובן", בלי הצהרות שאתה AI, בלי חזרה על השאלה.
3. תמיד לתת ערך קונקרטי: מספר, טווח מחירים, תובנת שוק, שם שכונה, צעד פרקטי. לא תשובות ענן.
4. לסיים בשאלה אחת ממוקדת שמקדמת את העסקה (תקציב, חדרים, אזור, מועד כניסה, מצב מימון) או בהצעה לתיאום צפייה. שאלה אחת בלבד.
5. לא להמציא: אם אין לך את הנתון על נכס ספציפי, לומר בכיאות שתבדוק עם ${ownerRef} ותחזור עם תשובה מדויקת, ולהמשיך את השיחה.
6. ללא אימוג'ים מוגזמים (עד אחד, ורק אם זה מתאים), ללא בולטים אלא אם באמת מציגים 2-3 אופציות נכסים, ללא מקפים ארוכים (— או --), ללא markdown כבד.
7. אם המתעניין כותב אנגלית או רוסית, ענה באותה שפה באותו סגנון.
8. לא להבטיח מחיר סופי, תשואה מובטחת או אישור משכנתא. אפשר לתת טווחים והערכות מקצועיות ולסמן אותן כהערכה.

פרטי המתעניין:
- שם: ${name || "לא ידוע (אל תמציא שם, אפשר לשאול)"}
- סוג עסקה: ${deal}
- עיר/שכונה מוכרת: ${lead.city ?? "-"} ${lead.neighborhood ?? ""}
${contextBlock ? `\nנתונים חיים מהמשרד (השתמש רק במה שכתוב כאן):\n${contextBlock}` : ""}

החזר טקסט תשובה בלבד, מוכן לשליחה בוואטסאפ. ללא JSON, ללא כותרות, ללא מטא-הערות.`;
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
      content: String(m.content).slice(0, 900),
    }));
  if (!recent.length || recent[recent.length - 1].role !== "user") {
    recent.push({ role: "user", content: input.inboundText.slice(0, 900) });
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
          { role: "system", content: buildFastReplyPrompt(input.lead, input.contextBlock, input.owner, input.domain ?? "real_estate") },
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

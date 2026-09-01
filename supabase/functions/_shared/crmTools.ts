// Native function-calling definitions for CRM writes.
//
// The model MUST use these tools instead of emitting JSON action envelopes as
// text. The gateway returns them in `message.tool_calls`, which the edge
// function intercepts and executes server-side (see ai-agent/index.ts).

export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });

function fn(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
): ToolDef {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties, required, additionalProperties: false },
    },
  };
}

const CONTACT_FIELDS = {
  full_name: str("שם מלא של איש הקשר"),
  phone: str("טלפון ישראלי, ספרות בלבד או 05XXXXXXXX"),
  email: str("אימייל"),
  city: str("עיר"),
  deal_type: str("sale או rent"),
  lead_stage: str("שלב במשפך"),
  interest_tag: str("תיוג עניין"),
  status: str("סטטוס"),
  notes: str("הערות חופשיות"),
};

const PROPERTY_FIELDS = {
  property_title: str("כותרת הנכס"),
  address: str("כתובת"),
  city: str("עיר"),
  neighborhood: str("שכונה"),
  rooms: num("מספר חדרים"),
  sqm: num("מ\"ר"),
  floor: num("קומה"),
  asking_price: num("מחיר מבוקש בשקלים"),
  deal_type: str("sale או rent"),
  description: str("תיאור"),
  office_notes: str("הערות משרד"),
  owner_name: str("שם בעל הנכס"),
  owner_phone: str("טלפון בעל הנכס"),
  status: str("live, pending או discarded"),
};

/** OpenAI-compatible tool list sent to the Lovable AI Gateway. */
export const CRM_TOOL_DEFS: ToolDef[] = [
  fn("create_contact", "פתיחת כרטיס איש קשר חדש ב-CRM. חובה טלפון.", CONTACT_FIELDS, ["full_name", "phone"]),
  fn("update_contact", "עדכון פרטי איש קשר קיים. זיהוי לפי lead_id, ואם אינו ידוע לפי phone.", {
    lead_id: str("מזהה איש הקשר אם ידוע"),
    ai_autopilot: { type: "boolean", description: "הפעלת מענה AI אוטומטי" },
    ...CONTACT_FIELDS,
  }),
  fn("delete_contact", "מחיקת איש קשר. רק כשהמשתמש ביקש זאת במפורש.", {
    lead_id: str("מזהה איש הקשר"),
    phone: str("טלפון איש הקשר אם אין מזהה"),
  }),
  fn("merge_contacts", "איחוד שני כרטיסים כפולים לכרטיס אחד.", {
    primary_lead_id: str("הכרטיס שנשמר"),
    duplicate_lead_id: str("הכרטיס שיימחק"),
  }, ["primary_lead_id", "duplicate_lead_id"]),
  fn("create_property", "הוספת נכס חדש.", PROPERTY_FIELDS, ["address"]),
  fn("update_property", "עדכון נכס קיים לפי listing_id, ואם אינו ידוע לפי כתובת ועיר.", {
    listing_id: str("מזהה הנכס"),
    ...PROPERTY_FIELDS,
  }),
  fn("delete_property", "מחיקת נכס.", { listing_id: str("מזהה הנכס") }, ["listing_id"]),
  fn("create_note", "שמירת הערה.", {
    content: str("תוכן ההערה"),
    lead_id: str("איש קשר משויך"),
    listing_id: str("נכס משויך"),
  }, ["content"]),
  fn("log_call", "תיעוד שיחה שהתקיימה.", {
    content: str("סיכום השיחה"),
    lead_id: str("איש קשר משויך"),
    channel: str("phone או whatsapp"),
  }, ["content"]),
  fn("create_reminder", "קביעת תזכורת בזמן מוחלט.", {
    title: str("כותרת"),
    content: str("פירוט"),
    due_at: str("זמן ISO 8601 מוחלט, בין 09:00 ל-21:00 שעון ישראל"),
    priority: str("high, medium או low"),
    lead_id: str("איש קשר משויך"),
    listing_id: str("נכס משויך"),
  }, ["title", "due_at"]),
  fn("create_task", "פתיחת משימה.", {
    title: str("כותרת"),
    content: str("פירוט"),
    due_at: str("זמן ISO 8601 מוחלט"),
    priority: str("high, medium או low"),
    action_type: str("follow_up, call, property_search או status_check"),
    lead_id: str("איש קשר משויך"),
    listing_id: str("נכס משויך"),
  }, ["title"]),
  fn("complete_task", "סימון משימה כהושלמה.", { task_id: str("מזהה המשימה") }, ["task_id"]),
  fn("delete_task", "מחיקת משימה.", { task_id: str("מזהה המשימה") }, ["task_id"]),
];

const TOOL_NAMES = new Set(CRM_TOOL_DEFS.map((t) => t.function.name));

type RawToolCall = {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: unknown };
};

/**
 * Translate native tool_calls into the internal CrmAction envelope executed by
 * executeCrmActions(). Unknown tools and unparsable arguments are dropped.
 */
export function toolCallsToActions(toolCalls: unknown): Record<string, any>[] {
  if (!Array.isArray(toolCalls)) return [];
  const out: Record<string, any>[] = [];
  for (const call of toolCalls as RawToolCall[]) {
    const name = String(call?.function?.name ?? "");
    if (!TOOL_NAMES.has(name)) continue;
    const rawArgs = call?.function?.arguments;
    let args: Record<string, any> = {};
    if (typeof rawArgs === "string") {
      try {
        const p = JSON.parse(rawArgs || "{}");
        if (p && typeof p === "object") args = p as Record<string, any>;
      } catch {
        // Malformed arguments: skip this call rather than guessing.
        continue;
      }
    } else if (rawArgs && typeof rawArgs === "object") {
      args = rawArgs as Record<string, any>;
    }
    out.push({ ...args, kind: name });
  }
  return out;
}

/** Extra system-prompt clause pinning the model to native tool calling. */
export const NATIVE_TOOLS_CONTRACT = `
[NATIVE TOOL CALLING - MANDATORY]
כל כתיבה ל-CRM (הוספה, עדכון, מחיקה, איחוד, הערות, שיחות, תזכורות, משימות) מתבצעת
אך ורק דרך קריאות הכלים הנייטיביות (function calling) שסופקו לך. אסור לחלוטין לכתוב
JSON, מעטפת actions, code fences, SQL של כתיבה, שמות שדות או UUID בתוך הטקסט שהמשתמש רואה.
אתה מפעיל את הכלים ישירות, ואת התשובה למשתמש כותב בעברית טבעית ומקצועית בלבד.
אסור לך להצהיר שפעולה בוצעה לפני שהכלי הוחזר בהצלחה; הדיווח הסופי נוצר מהתוצאה האמיתית במערכת.
`.trim();

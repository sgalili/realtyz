// ============================================================
// brokerRecruitment
// ------------------------------------------------------------
// Shared helpers for Rita's broker-recruitment conversations on the official
// Meta-verified WhatsApp number.
//
// When an agent replies to the approved outreach template ("נשמע טוב"), the
// thread MUST be handled by Rita in recruitment mode — never by the owner
// command router, and never with an internal error sentence.
// ============================================================

/** Approved Meta template used for the broker first-touch blast. */
export const BROKER_WA_TEMPLATE_NAME = "invitation_to_realestate_brokers";
export const BROKER_WA_TEMPLATE_ID = "1543480823752149";

/** Distinctive phrases that only appear in the recruitment outreach copy. */
const RECRUITMENT_ANCHORS = [
  "RealtyZ",
  "Realtyz",
  "מערכת AI שנבנתה במיוחד למתווכים",
  "שיחת זום קצרה להדגמה",
  "ההתנסות בחינם",
];

/**
 * Professional Hebrew reply Rita sends when the AI pipeline could not produce
 * text. It still carries the all-in-one pitch and the Zoom ask, so the prospect
 * NEVER sees a system error.
 */
export function ritaRecruitmentFallback(
  name?: string | null,
  gender?: "male" | "female" | null,
): string {
  const clean = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  const hello = clean ? `${clean}, ` : "";
  // Hebrew inflects for the recipient: "שאראה לך" is identical, but the verb
  // in the closing question changes ("נוח לך" is shared, "שלך" is shared),
  // so the difference sits in the second-person phrasing below.
  const closing = gender === "female"
    ? "מתי נוח לך לזום קצר של כ-15 דקות כדי שאראה לך את זה על הנכסים שאת מנהלת?"
    : "מתי נוח לך לזום קצר של כ-15 דקות כדי שאראה לך את זה על הנכסים שאתה מנהל?";
  return (
    `${hello}תודה על התגובה, שמחה לשמוע.\n` +
    "בקצרה: Realtyz מרכזת במקום אחד את הלידים, אנשי הקשר, הנכסים, המעקבים וההתאמות, " +
    "וגם את הפרסום וכלי ה-AI שעונים לפניות בשמך מסביב לשעון. במקום חמש מערכות נפרדות, מערכת אחת שבה שום פנייה לא נופלת.\n" +
    closing
  );
}

/** Internal-failure sentences that must never reach a prospect. */
const SYSTEM_ERROR_MARKERS = [
  "לא הצלחתי להשלים את הפעולה",
  "אירעה שגיאה קטנה בשליפת הנתונים",
  "קצין המודיעין",
];

export function looksLikeSystemErrorReply(text: string | null | undefined): boolean {
  const t = String(text ?? "");
  if (!t.trim()) return true;
  return SYSTEM_ERROR_MARKERS.some((m) => t.includes(m));
}

/**
 * True when this phone is in an active broker-recruitment conversation: the
 * workspace already sent it the approved outreach template or the recruitment
 * copy within the last 60 days.
 */
export async function isRecruitmentThread(
  admin: { from: (t: string) => any },
  phone: string,
): Promise<boolean> {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return false;
  const variants = Array.from(new Set([
    digits,
    `+${digits}`,
    digits.startsWith("972") ? `0${digits.slice(3)}` : digits,
    digits.startsWith("0") ? `972${digits.slice(1)}` : digits,
  ]));
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data } = await admin
      .from("messages")
      .select("content, metadata, created_at")
      .eq("direction", "outbound")
      .gte("created_at", since)
      .or(variants.map((v) => `metadata->>sender_phone.eq.${v}`).join(","))
      .order("created_at", { ascending: false })
      .limit(30);
    const rows = (data ?? []) as Array<{ content?: string; metadata?: Record<string, unknown> }>;
    if (rows.some((r) => matchesRecruitment(r))) return true;
  } catch (_) { /* fall through to the lead-scoped probe */ }

  // Fallback probe: resolve the lead by phone, then read its outbound history.
  try {
    const { data: leadRows } = await admin
      .from("leads")
      .select("id, preferences")
      .in("phone_number", variants)
      .limit(1);
    const lead = (leadRows ?? [])[0] as { id?: string; preferences?: Record<string, unknown> } | undefined;
    if (!lead?.id) return false;
    if (String((lead.preferences as any)?.lead_kind ?? "") === "broker") return true;
    const { data: msgs } = await admin
      .from("messages")
      .select("content, metadata")
      .eq("lead_id", lead.id)
      .eq("direction", "outbound")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(30);
    return ((msgs ?? []) as any[]).some((r) => matchesRecruitment(r));
  } catch (_) {
    return false;
  }
}

function matchesRecruitment(row: { content?: string; metadata?: Record<string, unknown> } | null): boolean {
  if (!row) return false;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  if (String(meta.template_name ?? "") === BROKER_WA_TEMPLATE_NAME) return true;
  if (meta.recruitment_outreach === true) return true;
  const content = String(row.content ?? "");
  return RECRUITMENT_ANCHORS.some((a) => content.includes(a));
}

/**
 * True when the MOST RECENT outbound message to this phone is the broker
 * recruitment outreach. That makes the inbound message a direct reply to it, so
 * Rita takes the conversation even if the phone also belongs to a workspace
 * owner (self-tests, brokers who are also users).
 */
export async function isReplyToRecruitmentOutreach(
  admin: { from: (t: string) => any },
  phone: string,
): Promise<boolean> {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return false;
  const variants = Array.from(new Set([
    digits,
    `+${digits}`,
    digits.startsWith("972") ? `0${digits.slice(3)}` : digits,
    digits.startsWith("0") ? `972${digits.slice(1)}` : digits,
  ]));
  try {
    const { data: leadRows } = await admin
      .from("leads")
      .select("id")
      .in("phone_number", variants)
      .limit(5);
    const ids = ((leadRows ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (!ids.length) return false;
    const { data: msgs } = await admin
      .from("messages")
      .select("content, metadata, created_at")
      .in("lead_id", ids)
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(1);
    const last = ((msgs ?? []) as any[])[0];
    return matchesRecruitment(last ?? null);
  } catch (_) {
    return false;
  }
}

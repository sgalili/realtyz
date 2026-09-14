// Live CRM counters for the ACTIVE workspace only.
//
// Rita is regularly asked "how many contacts do we have right now?" on
// WhatsApp. The fast lane has no tools, so instead of guessing (or failing
// into a fallback sentence) we pre-fetch exact counters and hand them to the
// prompt as facts. Every query is scoped by `workspace_owner_id` — never by
// member ids — so no other workspace can ever be counted here.

export interface CrmCounts {
  contacts: number;
  contactsNewWeek: number;
  properties: number;
  propertiesLive: number;
}

/** Matches Hebrew/English questions about how many contacts/properties exist. */
const COUNT_QUESTION_RE =
  /(כמה\s+(?:אנשי\s+קשר|איש\s+קשר|לידים|נכסים|דירות|רשומות)|מספר\s+(?:אנשי\s+הקשר|הנכסים)|ספירת|how\s+many\s+(?:contacts|leads|properties|listings)|contact\s+count)/i;

export function asksForCrmCounts(text: string): boolean {
  return COUNT_QUESTION_RE.test(String(text ?? ""));
}

/**
 * Exact counters for one workspace. Never throws: a failed counter comes back
 * as 0 alongside `ok: false` so the caller can stay silent instead of lying.
 */
export async function fetchWorkspaceCrmCounts(
  admin: { from: (table: string) => any },
  workspaceOwnerId: string | null | undefined,
): Promise<{ ok: boolean; counts: CrmCounts }> {
  const empty: CrmCounts = { contacts: 0, contactsNewWeek: 0, properties: 0, propertiesLive: 0 };
  if (!workspaceOwnerId) return { ok: false, counts: empty };

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const [contacts, week, properties, live] = await Promise.all([
      admin.from("leads").select("id", { count: "exact", head: true })
        .eq("workspace_owner_id", workspaceOwnerId).not("is_demo", "is", true),
      admin.from("leads").select("id", { count: "exact", head: true })
        .eq("workspace_owner_id", workspaceOwnerId).not("is_demo", "is", true).gte("created_at", weekAgo),
      admin.from("listings").select("id", { count: "exact", head: true })
        .eq("workspace_owner_id", workspaceOwnerId),
      admin.from("listings").select("id", { count: "exact", head: true })
        .eq("workspace_owner_id", workspaceOwnerId).eq("status", "live"),
    ]);
    if (contacts.error) throw contacts.error;
    if (properties.error) throw properties.error;
    return {
      ok: true,
      counts: {
        contacts: contacts.count ?? 0,
        contactsNewWeek: week.error ? 0 : (week.count ?? 0),
        properties: properties.count ?? 0,
        propertiesLive: live.error ? 0 : (live.count ?? 0),
      },
    };
  } catch (e) {
    console.error("[crmSnapshot] count failed", e instanceof Error ? e.message : String(e));
    return { ok: false, counts: empty };
  }
}

/** Hebrew fact block, safe to paste into a prompt. */
export function renderCrmCountsBlock(counts: CrmCounts): string {
  return [
    "ספירות CRM חיות של מרחב העבודה הפעיל (נתון מדויק, מותר לצטט כמו שהוא):",
    `אנשי קשר: ${counts.contacts}`,
    `אנשי קשר חדשים בשבעה הימים האחרונים: ${counts.contactsNewWeek}`,
    `נכסים: ${counts.properties} (מתוכם פעילים: ${counts.propertiesLive})`,
  ].join("\n");
}

/** Deterministic Hebrew answer in Rita's feminine voice. */
export function renderCrmCountsAnswer(counts: CrmCounts): string {
  return `בדקתי כרגע במערכת: יש ${counts.contacts} אנשי קשר ו-${counts.properties} נכסים במרחב העבודה הפעיל.`;
}

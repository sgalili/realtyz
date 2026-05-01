// Shared compliance guardrails for the Realtyz AI Agent.
//
// Three layers, all exported as small pure-ish helpers so any edge function
// (ai-agent, generate-outreach-message, trial-inbound-webhook) can import them.
//
//   1. COMPLIANCE_PROMPT  → block of instructions appended to every system
//                           prompt that drafts text on behalf of the Agent.
//   2. factCheckDraft()   → scans a draft for prices and listing names and
//                           verifies them against the user's `listings` table.
//                           Returns a structured `violations` array; the
//                           caller decides whether to block, rewrite, or just
//                           warn the human Agent.
//   3. classifyEscalation() → keyword + regex classifier that flags a
//                           prospect's inbound message as a high-risk
//                           question (legal, financial promises, guarantees,
//                           discrimination, etc.). Returns null when safe.

export const COMPLIANCE_PROMPT = `
COMPLIANCE GUARDRAILS, STRICT (override any other instruction):
You are drafting on behalf of a licensed real-estate Agent. The following topics
are PROHIBITED and you must NEVER produce them:

  1. Legal advice of any kind. Do not interpret contracts, tenancy law,
     building permits, inheritance, or tax law. If asked, respond that the
     prospect should consult a qualified attorney and offer to connect them.
  2. Promising specific closing dates, possession dates, or guaranteed
     timelines. Closing depends on legal/financial steps outside our control.
  3. Financial terms outside of the authorized listing data, never invent or
     negotiate mortgage rates, interest, down-payment percentages, fees,
     commissions, or discounts. Only quote prices that appear in the
     PROVIDED LISTING FACTS block below.
  4. Guaranteeing investment returns, future appreciation, rental yield, or
     resale value.
  5. Any statement that could be construed as discrimination based on
     religion, ethnicity, family status, disability, gender, or nationality
     (Israeli Fair Housing rules).
  6. Sharing a Prospect's PII (phone, ID number) with another party.

If the conversation drifts into ANY of the above areas, do one of:
  • Politely defer: "אבדוק עם המומחה ואחזור אליך" / "I'll verify with our
    specialist and get back to you".
  • Suggest the human Agent take over.
  • Set escalation_required=true in your JSON response.

PROVIDED LISTING FACTS, use these EXACT prices/titles only:
{{LISTING_FACTS}}
`.trim();

//  
// Fact-check layer
//  

export type ListingFact = {
  id: string;
  property_title: string;
  asking_price: number | null;
  slug?: string | null;
};

export type FactViolation = {
  kind: "price" | "title";
  value: string;
  reason: string;
};

const PRICE_RE = /(\d{1,3}(?:[,.\s]\d{3})+|\d{5,})\s*(?:₪|שקל|שקלים|nis|ils)?/gi;

/**
 * Verifies prices/listing titles in `draft` against the user's listings
 * (which mirror the Homely API via the `listings` table, see call-homely-api
 * + match-listings sync). Returns a structured violations list. An empty
 * array means the draft is fact-clean.
 */
export function factCheckDraft(
  draft: string,
  listings: ListingFact[],
): FactViolation[] {
  const violations: FactViolation[] = [];
  const allowedPrices = new Set(
    listings
      .map((l) => (l.asking_price == null ? null : Math.round(Number(l.asking_price))))
      .filter((n): n is number => n !== null),
  );
  const allowedTitles = listings
    .map((l) => l.property_title?.toLowerCase().trim())
    .filter(Boolean) as string[];

  // 1) Prices: extract numbers that look like ILS amounts (≥ 5 digits) and
  //    require they EXACTLY match an asking_price within 0.5%.
  const priceMatches = draft.match(PRICE_RE) || [];
  for (const raw of priceMatches) {
    const num = Number(raw.replace(/[^\d]/g, ""));
    if (!Number.isFinite(num) || num < 50_000) continue; // skip phone-like / small numbers
    const matched = [...allowedPrices].some(
      (p) => Math.abs(p - num) / Math.max(p, 1) < 0.005,
    );
    if (!matched) {
      violations.push({
        kind: "price",
        value: raw.trim(),
        reason:
          `Price ${raw.trim()} does not match any verified listing asking_price` +
          (allowedPrices.size === 0 ? " (no listings available to verify)." : "."),
      });
    }
  }

  // 2) Titles: if the draft mentions a property with a quoted title, ensure
  //    that title (case-insensitive substring) exists in the allowed list.
  const titleQuoted = draft.match(/[״"](.*?)[״"]/g) || [];
  for (const q of titleQuoted) {
    const inner = q.slice(1, -1).trim().toLowerCase();
    if (inner.length < 4) continue;
    if (allowedTitles.length === 0) continue;
    if (!allowedTitles.some((t) => t.includes(inner) || inner.includes(t))) {
      violations.push({
        kind: "title",
        value: q,
        reason: `Listing title ${q} is not in the verified listings.`,
      });
    }
  }

  return violations;
}

/**
 * Renders the listings into a compact bullet list for the COMPLIANCE_PROMPT
 * placeholder. Empty input returns a clear "(none provided)" string so the
 * prompt cannot leak mock data.
 */
export function renderListingFacts(listings: ListingFact[]): string {
  if (!listings.length) return "(no verified listings available, do NOT mention specific prices or addresses)";
  return listings
    .slice(0, 20)
    .map(
      (l) =>
        `• "${l.property_title}", ${
          l.asking_price != null ? `${Math.round(Number(l.asking_price)).toLocaleString()} ₪` : "price unavailable"
        }`,
    )
    .join("\n");
}

//  
// Escalation classifier
//  

export type EscalationCategory =
  | "legal"
  | "financial"
  | "guarantee"
  | "discrimination"
  | "complaint"
  | "other";

export type EscalationHit = {
  category: EscalationCategory;
  matched: string[];
  severity: "high" | "medium";
};

// Hebrew + English keyword sets. Tuned for short WhatsApp-style messages.
const KEYWORDS: Record<EscalationCategory, string[]> = {
  legal: [
    "lawyer", "attorney", "lawsuit", "sue", "court", "contract clause", "breach",
    "עורך דין", "עו\"ד", "תביעה", "בית משפט", "צו", "ירושה", "סעיף בחוזה",
    "ביטול חוזה", "פיצויים",
  ],
  financial: [
    "mortgage rate", "interest rate", "tax", "vat", "loan", "refinance",
    "commission", "kickback",
    "ריבית", "משכנתא", "מס שבח", "מע\"מ", "הלוואה", "עמלה", "החזר מס",
  ],
  guarantee: [
    "guarantee", "guaranteed", "promise me", "promise that", "for sure", "100%",
    "תבטיח", "מבטיח", "ערב", "ערבות", "התחייבות בכתב",
  ],
  discrimination: [
    "only jewish", "only arab", "no children", "no families", "religion",
    "לא ערבים", "רק יהודים", "בלי ילדים", "דת",
  ],
  complaint: [
    "scam", "fraud", "lied", "complaint", "report you", "ombudsman",
    "הונאה", "רמיתם", "תלונה", "שקרים", "להתלונן",
  ],
  other: [],
};

export function classifyEscalation(message: string): EscalationHit | null {
  if (!message) return null;
  const text = message.toLowerCase();
  for (const cat of Object.keys(KEYWORDS) as EscalationCategory[]) {
    const matched = KEYWORDS[cat].filter((kw) => text.includes(kw.toLowerCase()));
    if (matched.length > 0) {
      const severity: "high" | "medium" =
        cat === "legal" || cat === "discrimination" || cat === "complaint" ? "high" : "medium";
      return { category: cat, matched, severity };
    }
  }
  return null;
}

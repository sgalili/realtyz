// Resolves the persona of the ACTIVE workspace only.
//
// There are no hardcoded fallbacks to any specific business, broker or agency:
// a brand-new workspace starts with an empty persona and the AI is told to
// ground itself strictly in that workspace's own knowledge base. The business
// domain is derived from the workspace's own persona/KB text, so a software
// (SaaS) workspace never inherits property-listing behaviour, and vice versa.

export type WorkspaceDomain = "real_estate" | "software" | "generic";

export interface WorkspacePersona {
  ownerId: string | null;
  /** Display name of the workspace owner, empty when not filled in yet. */
  name: string;
  /** Business / agency / product line, empty when not filled in yet. */
  agency: string;
  /** Free-text persona brief authored by the workspace owner. */
  brief: string;
  tone: string;
  domain: WorkspaceDomain;
}

export const EMPTY_PERSONA: WorkspacePersona = {
  ownerId: null,
  name: "",
  agency: "",
  brief: "",
  tone: "",
  domain: "generic",
};

const SOFTWARE_HINTS = [
  "saas", "software", "platform", "פלטפורמה", "תוכנה", "מערכת", "crm",
  "realtyz", "demo", "דמו", "זום", "zoom", "מנוי", "subscription", "b2b",
];
const REAL_ESTATE_HINTS = [
  "נדל", "דירה", "נכס", "תיווך", "מתווך", "listing", "broker", "real estate",
  "apartment", "property",
];

function scoreDomain(text: string): WorkspaceDomain {
  const t = text.toLowerCase();
  let soft = 0;
  let re = 0;
  for (const h of SOFTWARE_HINTS) if (t.includes(h)) soft++;
  for (const h of REAL_ESTATE_HINTS) if (t.includes(h)) re++;
  if (soft === 0 && re === 0) return "generic";
  return soft > re ? "software" : "real_estate";
}

type MinimalClient = {
  from: (t: string) => any;
};

const cache = new Map<string, { at: number; value: WorkspacePersona }>();
const TTL_MS = 60_000;

/**
 * Loads the persona of `ownerId`'s workspace. `admin` must be a service-role
 * client. Never falls back to another workspace's data.
 */
export async function fetchWorkspacePersona(
  admin: MinimalClient,
  ownerId: string | null | undefined,
): Promise<WorkspacePersona> {
  if (!ownerId) return EMPTY_PERSONA;
  const hit = cache.get(ownerId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let name = "";
  let agency = "";
  let brief = "";
  let tone = "";

  try {
    const { data: prof } = await admin
      .from("profiles")
      .select("full_name, broker_byline")
      .eq("id", ownerId)
      .maybeSingle();
    name = String(prof?.full_name ?? "").trim();
    agency = String(prof?.broker_byline ?? "").trim();
  } catch { /* empty persona is the safe default */ }

  try {
    const { data: persona } = await admin
      .from("agent_personas")
      .select("professional_bio, selling_philosophy, tone, tone_custom, signature")
      .eq("user_id", ownerId)
      .maybeSingle();
    brief = [
      String(persona?.professional_bio ?? "").trim(),
      String(persona?.selling_philosophy ?? "").trim(),
    ].filter(Boolean).join("\n");
    tone = String(persona?.tone_custom ?? persona?.tone ?? "").trim();
  } catch { /* keep empty */ }

  // Domain hints come from the workspace's own persona text + KB doc titles.
  let kbTitles = "";
  try {
    const { data: docs } = await admin
      .from("knowledge_documents")
      .select("title")
      .eq("user_id", ownerId)
      .limit(40);
    kbTitles = (docs ?? []).map((d: { title?: string }) => d?.title ?? "").join(" ");
  } catch { /* keep empty */ }

  const value: WorkspacePersona = {
    ownerId,
    name,
    agency,
    brief,
    tone,
    domain: scoreDomain(`${agency} ${brief} ${tone} ${kbTitles}`),
  };
  cache.set(ownerId, { at: Date.now(), value });
  return value;
}

/**
 * The persona block to prepend to any generation prompt. Built only from the
 * workspace's own data; when nothing is configured the model is instructed to
 * derive everything from the workspace knowledge base instead of inventing a
 * business or borrowing another workspace's identity.
 */
export function renderPersonaBlock(p: WorkspacePersona): string {
  const who = [p.name, p.agency].filter(Boolean).join(" — ");
  const lines: string[] = ["PERSONA (workspace-scoped, LOCKED):"];
  if (who) {
    lines.push(`You write on behalf of ${who}.`);
  } else {
    lines.push(
      "The workspace has not defined an identity yet. Derive who you are, what you sell, and how you speak ONLY from the workspace knowledge base below. Never assume a real-estate brokerage, never invent a person, a company, a phone number or a licence number.",
    );
  }
  if (p.brief) lines.push(`Owner-authored brief:\n${p.brief}`);
  if (p.tone) lines.push(`Tone: ${p.tone}`);
  if (p.domain === "software") {
    lines.push(
      "BUSINESS TYPE: B2B software (SaaS). You sell the workspace's software product to real-estate agents and agencies. You are NOT a real-estate broker and you never market individual properties, listings, prices of apartments or viewings. Your single goal is booking a short (about 15 minute) Zoom demo. Use ONLY the sales scripts, pricing tiers and objection-handling guidance found in the workspace knowledge base — if a detail (price, feature, terms) is not in the knowledge base, say you will confirm it and follow up.",
    );
  } else if (p.domain === "real_estate") {
    lines.push(
      "BUSINESS TYPE: real-estate brokerage. Only ever reference listings, prices and areas that exist in this workspace's own data.",
    );
  }
  lines.push(
    "Never reference any other workspace, broker, agency or product. Everything factual must come from this workspace's knowledge base and data.",
  );
  return lines.join("\n");
}

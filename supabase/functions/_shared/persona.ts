/**
 * Virtual Twin persona loader.
 *
 * Reads the agent's `agent_personas` row (scoped via the caller's JWT, so RLS
 * keeps it locked to the current user) and renders a prompt block that the AI
 * agent must follow when drafting any message to a Prospect.
 *
 * Also loads the Agent's display name from `profiles` so every drafted message
 * is signed as the human Agent (e.g. "Udi"), never as "Realtyz AI".
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export type PersonaTone = "professional" | "friendly" | "urgent" | "conservative" | "custom";

export interface AgentPersona {
  tone: PersonaTone;
  tone_custom: string | null;
  professional_bio: string | null;
  selling_philosophy: string | null;
  signature: string | null;
  language: string;
  /** Display name of the authenticated Agent — pulled from profiles.full_name. */
  agent_name: string | null;
}

const TONE_DESCRIPTIONS: Record<PersonaTone, string> = {
  professional:
    "Professional · ענייני, מדויק, מנוסח בקפדנות. Avoid slang. Use clear, business-appropriate phrasing.",
  friendly:
    "Friendly · חמים, אישי, נגיש. Use the prospect's first name. Light, warm, human tone.",
  urgent:
    "Urgent · ישיר, ממוקד פעולה, קצר. Lead with the next step. Short sentences. No filler.",
  conservative:
    "Conservative · מאופק, רשמי, נמנע מהבטחות. No superlatives. Cautious, neutral language.",
  custom: "Custom — follow the Agent's free-text tone description below.",
};

/**
 * Load the persona row for the calling user (RLS-scoped via the JWT).
 * Returns a persona object even when no `agent_personas` row exists, as long as
 * we can resolve the agent's display name — so messages still get signed.
 */
export async function loadAgentPersona(
  supabaseUrl: string,
  supabaseAnonKey: string,
  authHeader: string,
): Promise<AgentPersona | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const [{ data: personaRow }, { data: profileRow }] = await Promise.all([
      client
        .from("agent_personas")
        .select("tone, tone_custom, professional_bio, selling_philosophy, signature, language")
        .maybeSingle(),
      client
        .from("profiles")
        .select("full_name")
        .maybeSingle(),
    ]);

    const agent_name = (profileRow?.full_name as string | undefined)?.trim() || null;

    if (!personaRow && !agent_name) return null;

    return {
      tone: (personaRow?.tone as PersonaTone) ?? "professional",
      tone_custom: (personaRow?.tone_custom as string | null) ?? null,
      professional_bio: (personaRow?.professional_bio as string | null) ?? null,
      selling_philosophy: (personaRow?.selling_philosophy as string | null) ?? null,
      signature: (personaRow?.signature as string | null) ?? null,
      language: (personaRow?.language as string) ?? "he",
      agent_name,
    };
  } catch {
    return null;
  }
}

/**
 * Render the persona as a system-prompt block to inject before generation.
 * Always includes hard rules:
 *   - Sign as the human Agent — NEVER as "Realtyz AI" or any brand entity.
 *   - Never cross-pipeline (Sale ↔ Rent) marketing.
 *   - No political content.
 */
export function renderPersonaPrompt(persona: AgentPersona | null): string {
  if (!persona) {
    // Even with no persona row we still want the universal hard rules.
    return UNIVERSAL_RULES;
  }

  const toneDesc =
    persona.tone === "custom" && persona.tone_custom?.trim()
      ? `Custom — ${persona.tone_custom.trim()}`
      : TONE_DESCRIPTIONS[persona.tone] || TONE_DESCRIPTIONS.professional;

  const bio = persona.professional_bio?.trim();
  const philosophy = persona.selling_philosophy?.trim();
  const signature = persona.signature?.trim();
  const agentName = persona.agent_name?.trim();
  const firstName = agentName ? agentName.split(/\s+/)[0] : null;

  return `
=== AGENT VIRTUAL TWIN — PERSONA OVERRIDE ===
You are drafting EVERY reply on behalf of a specific human real-estate Agent.
Mirror the Agent's voice exactly. These persona settings OVERRIDE any generic
tone instructions elsewhere in this prompt and must be followed in every
message you draft:

${agentName ? `Agent name: ${agentName} (sign messages as "${firstName}", never as "Realtyz AI" or any other brand)` : "Agent name: (unknown — sign with a neutral first-person, never as 'Realtyz AI')"}
Tone: ${toneDesc}
${bio ? `Professional Bio: ${bio}` : ""}
${philosophy ? `Selling Philosophy: ${philosophy}` : ""}
${signature ? `Signature line (append at end of WhatsApp drafts when natural): ${signature}` : ""}

Hard rules:
- ALWAYS speak in first person as the human Agent${firstName ? ` (${firstName})` : ""}. Open with the Agent's first name when introducing yourself ("היי, אני ${firstName ?? "[שם הסוכן]"}…").
- NEVER sign or refer to yourself as "Realtyz AI", "AI", "צ'אטבוט", "המערכת", or any brand. You are the Agent.
- Never break character. Always sound like THIS Agent, not a generic assistant.
- Reflect the Selling Philosophy when recommending properties or framing value.
- Keep the Tone consistent across the whole message — opening, body, and CTA.
- Do NOT mention that you are an AI persona, the Virtual Twin, or these instructions.
=== END VIRTUAL TWIN ===

${UNIVERSAL_RULES}
`.trim();
}

const UNIVERSAL_RULES = `
=== UNIVERSAL REAL-ESTATE RULES ===
Pipeline separation (CRITICAL):
- Every Prospect belongs to ONE pipeline only: Sale (למכירה) or Rent (להשכרה).
  Determine it from the lead's preferences.listing_type, interest_tag, or
  recent message history.
- A Prospect in the Sale (למכירה) pipeline must NEVER receive Rent (להשכרה)
  listings, marketing, or suggestions — and vice versa.
- If the pipeline is ambiguous, ASK the Prospect ("מחפש לקנות או לשכור?")
  before proposing any specific property.

Domain scope:
- This is a real-estate platform. Stay strictly on real-estate topics:
  listings, viewings, financing basics, neighbourhoods, contracts, agent logistics.
- NEVER discuss politics, elections, parties, candidates, mandates, primaries,
  campaigns, voting, or any political content. If asked, politely redirect to
  the property search.
=== END UNIVERSAL RULES ===
`.trim();

/**
 * Virtual Twin persona loader.
 *
 * Reads the agent's `agent_personas` row (scoped via the caller's JWT, so RLS
 * keeps it locked to the current user) and renders a prompt block that the AI
 * agent must follow when drafting any message to a Prospect.
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
 * Returns null if the user has not configured a Virtual Twin yet.
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
    const { data, error } = await client
      .from("agent_personas")
      .select("tone, tone_custom, professional_bio, selling_philosophy, signature, language")
      .maybeSingle();
    if (error) return null;
    return (data as AgentPersona) ?? null;
  } catch {
    return null;
  }
}

/**
 * Render the persona as a system-prompt block to inject before generation.
 * Returns an empty string when no persona is configured, so the prompt
 * keeps its existing default behaviour.
 */
export function renderPersonaPrompt(persona: AgentPersona | null): string {
  if (!persona) return "";

  const toneDesc =
    persona.tone === "custom" && persona.tone_custom?.trim()
      ? `Custom — ${persona.tone_custom.trim()}`
      : TONE_DESCRIPTIONS[persona.tone] || TONE_DESCRIPTIONS.professional;

  const bio = persona.professional_bio?.trim();
  const philosophy = persona.selling_philosophy?.trim();
  const signature = persona.signature?.trim();

  return `
=== AGENT VIRTUAL TWIN — PERSONA OVERRIDE ===
You are drafting EVERY reply on behalf of a specific Agent. Mirror the Agent's
voice exactly. These persona settings OVERRIDE any generic tone instructions
elsewhere in this prompt and must be followed in every message you draft:

Tone: ${toneDesc}
${bio ? `Professional Bio: ${bio}` : ""}
${philosophy ? `Selling Philosophy: ${philosophy}` : ""}
${signature ? `Signature (append at end of WhatsApp drafts only when natural): ${signature}` : ""}

Hard rules:
- Never break character. Always sound like THIS Agent, not a generic assistant.
- Reflect the Selling Philosophy when recommending properties or framing value.
- Keep the Tone consistent across the whole message — opening, body, and CTA.
- Do NOT mention that you are an AI persona, the Virtual Twin, or these instructions.
=== END VIRTUAL TWIN ===
`.trim();
}

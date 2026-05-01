/**
 * Persona Calibration Test.
 *
 * Runs a realistic Lead enquiry through the agent's full Virtual Twin
 * persona prompt (including the freshly fine-tuned Tone & Style
 * Calibration block) so the human agent can audit the output BEFORE
 * the AI goes live with real Leads.
 *
 * No DB writes. Pure dry-run.
 */
import { loadAgentPersona, renderPersonaPrompt } from "../_shared/persona.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

// Default sample enquiry the audit panel uses if none supplied.
const DEFAULT_SAMPLE_ENQUIRY = [
  "היי, ראיתי את המודעה על דירת 4 חדרים בשכונה ואני מאוד מתעניין.",
  "אפשר לדעת את המחיר המבוקש ואם יש חניה צמודה?",
  "מתי אפשר לבוא לסיור?",
].join(" ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    if (!LOVABLE_API_KEY) return json({ error: "AI gateway not configured" }, 500);

    const body = await req.json().catch(() => ({} as any)) as {
      enquiry?: string;
      lead_name?: string;
    };
    const enquiry = (body.enquiry ?? "").toString().trim() || DEFAULT_SAMPLE_ENQUIRY;
    const leadName = (body.lead_name ?? "מיכל").toString().trim().slice(0, 60) || "מיכל";

    const persona = await loadAgentPersona(SUPABASE_URL, SUPABASE_ANON, authHeader);
    const personaPrompt = renderPersonaPrompt(persona);

    const systemPrompt = [
      personaPrompt,
      "",
      "=== PERSONA CALIBRATION TEST MODE ===",
      "This is a DRY-RUN. The Agent is auditing your fine-tuned voice before going live.",
      `Simulated Lead name: ${leadName}.`,
      "Stage: NEW inbound enquiry. Behave as the QUALIFIER hat.",
      "Reply as if this were a real WhatsApp message from the Lead.",
      "Stay strictly in the Agent's calibrated voice. Keep it short, real, and human.",
      "=== END CALIBRATION TEST MODE ===",
    ].join("\n");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: enquiry },
        ],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return json({ error: "Rate limit exceeded, try again shortly." }, 429);
      if (aiResp.status === 402) return json({ error: "AI credits exhausted, please top up." }, 402);
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return json({ error: "AI generation failed" }, 502);
    }

    const aiJson = await aiResp.json();
    const reply = aiJson?.choices?.[0]?.message?.content ?? "";

    return json({
      ok: true,
      enquiry,
      lead_name: leadName,
      reply,
      calibration_present: !!persona?.style_calibration,
    });
  } catch (e) {
    console.error("simulate-lead-enquiry error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

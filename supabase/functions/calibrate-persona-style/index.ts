/**
 * AI Fine-Tuning, Tone & Style Calibration.
 *
 * Receives raw text from the agent's uploaded WhatsApp / email exports
 * (PDF / TXT, extracted client-side), asks the Lovable AI gateway to
 * extract a structured Tone & Style profile, and persists it to
 * agent_personas.style_calibration for the calling user.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const MAX_INPUT_CHARS = 60_000; // ~15k tokens, plenty for tone extraction

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    if (!LOVABLE_API_KEY) return json({ error: "AI gateway not configured" }, 500);

    const body = await req.json().catch(() => null) as {
      samples?: Array<{ name?: string; text?: string }>;
    } | null;
    if (!body || !Array.isArray(body.samples) || body.samples.length === 0) {
      return json({ error: "samples[] required" }, 400);
    }

    // Concatenate, truncate, label by source filename.
    const sources: string[] = [];
    let combined = "";
    for (const s of body.samples) {
      const name = (s.name ?? "sample").toString().slice(0, 120);
      const text = (s.text ?? "").toString();
      if (!text.trim()) continue;
      sources.push(name);
      combined += `\n\n===== SOURCE: ${name} =====\n${text}`;
      if (combined.length >= MAX_INPUT_CHARS) break;
    }
    combined = combined.slice(0, MAX_INPUT_CHARS).trim();
    if (!combined) return json({ error: "No usable text in samples" }, 400);

    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    // Ask AI to extract a structured Tone & Style profile via tool calling.
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: [
              "You are a writing-style analyst for a real-estate AI persona.",
              "Read the agent's REAL past WhatsApp / email messages and extract the agent's writing voice.",
              "Be precise and verbatim. Quote signature phrases, openings, closings exactly as written.",
              "Detect the dominant language(s). Detect emoji usage frequency.",
              "Score formality, directness, warmth on a 1-5 scale based on the texts.",
              "Output ONLY via the extract_style tool, no prose.",
            ].join(" "),
          },
          {
            role: "user",
            content:
              `Below are exported chat / email logs from one human real-estate agent. ` +
              `Extract their personal writing style so an AI can mirror them.\n\n${combined}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_style",
              description: "Return a structured tone & style profile of the agent's writing.",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "One-paragraph human-readable voice summary." },
                  sentence_length: { type: "string", enum: ["very_short", "short", "medium", "long"] },
                  emoji_usage: { type: "string", enum: ["none", "rare", "moderate", "frequent"] },
                  language_mix: { type: "string", description: "e.g. he, en, mixed_he_en, ar." },
                  formality: { type: "integer", minimum: 1, maximum: 5 },
                  directness: { type: "integer", minimum: 1, maximum: 5 },
                  warmth: { type: "integer", minimum: 1, maximum: 5 },
                  punctuation_habits: { type: "string" },
                  common_openings: { type: "array", items: { type: "string" }, maxItems: 8 },
                  common_closings: { type: "array", items: { type: "string" }, maxItems: 8 },
                  signature_phrases: { type: "array", items: { type: "string" }, maxItems: 12 },
                  do_say: { type: "array", items: { type: "string" }, maxItems: 8 },
                  dont_say: { type: "array", items: { type: "string" }, maxItems: 8 },
                },
                required: ["summary", "sentence_length", "emoji_usage", "language_mix"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_style" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return json({ error: "Rate limit exceeded, try again shortly." }, 429);
      if (aiResp.status === 402) return json({ error: "AI credits exhausted, please top up." }, 402);
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return json({ error: "AI extraction failed" }, 502);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = toolCall?.function?.arguments;
    if (!argsRaw) return json({ error: "AI returned no profile" }, 502);

    let profile: Record<string, unknown>;
    try {
      profile = JSON.parse(argsRaw);
    } catch {
      return json({ error: "AI returned invalid JSON profile" }, 502);
    }
    profile.sources = sources;

    // Upsert into agent_personas (RLS scoped to user_id = auth.uid()).
    const nowIso = new Date().toISOString();
    const { error: upErr } = await supa
      .from("agent_personas")
      .upsert(
        {
          user_id: userId,
          style_calibration: profile,
          style_calibration_updated_at: nowIso,
        },
        { onConflict: "user_id" },
      );
    if (upErr) {
      console.error("Persist style_calibration failed:", upErr);
      return json({ error: upErr.message }, 500);
    }

    return json({
      ok: true,
      profile,
      updated_at: nowIso,
      source_count: sources.length,
    });
  } catch (e) {
    console.error("calibrate-persona-style error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

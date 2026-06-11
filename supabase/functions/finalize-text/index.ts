// finalize-text — polishes a user-edited draft into a "Final Version".
// Generic enhancer used by the AI Content Generator (post drafts) and the
// Campaign Comments Stream (public reply + private DM). Honors the user's
// edits as authoritative intent, then tightens tone, grammar, flow, and
// length while preserving the user's facts, numbers, names and language.
import { corsHeaders } from "../_shared/cors.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

type Purpose = "social_post" | "public_comment" | "private_dm" | "generic";

const PURPOSE_HINTS: Record<Purpose, string> = {
  social_post:
    "This is a social media post. Keep it scroll-stopping, natural, well-spaced, and ready to publish. Keep emojis only if the user kept them.",
  public_comment:
    "This is a PUBLIC comment reply on a social post. Keep it short (1-3 sentences), warm, on-brand, no hashtags, no signature.",
  private_dm:
    "This is a PRIVATE direct message. Conversational, 1-4 short sentences, one clear next step.",
  generic: "Polish the text while preserving the user's intent.",
};

function detectLang(s: string): "he" | "en" | "auto" {
  if (/[\u0590-\u05FF]/.test(s)) return "he";
  if (/^[\x00-\x7F\s]+$/.test(s)) return "en";
  return "auto";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
    const body = await req.json().catch(() => ({}));
    const edited_text: string = String(body?.edited_text ?? "").trim();
    const original_text: string = String(body?.original_text ?? "").trim();
    const context: string = String(body?.context ?? "").trim();
    const purpose: Purpose = (body?.purpose as Purpose) || "generic";
    if (!edited_text) {
      return new Response(JSON.stringify({ error: "edited_text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lang = detectLang(edited_text);
    const langLine =
      lang === "he"
        ? "Respond in Hebrew (עברית). RTL natural phrasing."
        : lang === "en"
          ? "Respond in English."
          : "Respond in the SAME language as the edited draft.";

    const SYSTEM = [
      "You are a senior copy editor producing the FINAL VERSION of a draft.",
      "The user has already edited the AI's first draft. Their edits are AUTHORITATIVE INTENT — preserve every fact, name, number, price, link, hashtag and emoji they kept.",
      "Do NOT introduce new facts, claims, listings, prices, or promises. Do NOT add a signature unless one is present.",
      "Improve grammar, flow, rhythm, punctuation, line breaks and clarity. Tighten where wordy. Keep the user's voice.",
      "FORBIDDEN punctuation: em-dash (—), en-dash (–), double hyphen (--), triple hyphen (---). Use commas or periods instead.",
      PURPOSE_HINTS[purpose] || PURPOSE_HINTS.generic,
      langLine,
      "Return ONLY the final text, with no preface, no explanation, no quotes around it.",
    ].join("\n");

    const userPrompt = [
      context ? `Context:\n${context}` : null,
      original_text ? `Original AI draft (for reference only):\n"""${original_text}"""` : null,
      `User-edited draft (AUTHORITATIVE — polish this, do not rewrite from scratch):\n"""${edited_text}"""`,
      "Produce the FINAL polished version now.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.55,
        top_p: 0.9,
        max_tokens: 900,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "credits_exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway ${aiRes.status}: ${errText.slice(0, 200)}`);
    }

    const data = await aiRes.json();
    let finalText: string = data?.choices?.[0]?.message?.content ?? "";
    finalText = String(finalText)
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/[—–]/g, ",")
      .replace(/---?/g, ",")
      .trim();

    if (!finalText) throw new Error("empty final text");

    return new Response(JSON.stringify({ final_text: finalText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[finalize-text]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

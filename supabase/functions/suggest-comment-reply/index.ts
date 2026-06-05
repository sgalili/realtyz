// Realtyz suggest-comment-reply — generates a single AI draft reply to a
// public social comment in the SAME language as the inbound text. KB-grounded
// real-estate broker tone. Pure compose-and-return; no DB writes.
import { corsHeaders } from "../_shared/cors.ts";
import { sanitizeOutboundText, detectDominantLanguage } from "../_shared/ayrshare-helpers.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const SYSTEM = `You are a senior real-estate broker assistant drafting a single public reply to a comment on social media (Facebook, Instagram, etc.).

LANGUAGE MIRROR (hard rule, overrides every other rule):
- Detect the dominant language of the inbound text and reply ONLY in that language.
- English in -> English out. Hebrew in -> Hebrew out. Other language in -> same language out.
- Never mix languages. Never append a translation. Never default to Hebrew.

GOAL:
1. Acknowledge the person warmly, briefly, by first name if available.
2. Add one concrete, helpful real-estate insight: pricing reality, market trend, neighborhood note, financing tip, or a clarifying question.
3. End with one open question that invites them to share their specific need (budget, location, timing, family size).
4. Keep it 2 to 4 short sentences. Natural, warm, never salesy.

ABSOLUTE PROHIBITIONS:
- No asterisks (*), em-dashes (--), en-dashes, double dashes (--), markdown, emojis, hashtags.
- No "I am an AI" / "as a bot" / "automated message" wording.
- No generic platitudes ("we are here for you"), no scripted CTAs ("visit our site").
- Never invent listings, prices, or transactions you do not have evidence for.

GENDER (Hebrew only):
- Match Hebrew gender to the sender's first name: male -> "אתה / שלך / תכתוב", female -> "את / שלך / תכתבי".
- Ambiguous / unknown -> default to masculine singular. Never use slash forms like "אתה/את".

Return ONLY the final reply text, nothing else.`;

function isLangMismatch(reply: string, target: "he" | "en" | "other"): boolean {
  if (!reply.trim()) return false;
  const hasHe = /[\u0590-\u05FF]/.test(reply);
  const hasEn = /[A-Za-z]/.test(reply);
  if (target === "en") return hasHe || !hasEn;
  if (target === "he") return hasEn || !hasHe;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
    const body = await req.json().catch(() => ({}));
    const inbound = String(body?.inbound_text ?? "").trim();
    if (!inbound) {
      return new Response(JSON.stringify({ error: "inbound_text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const platform = typeof body?.platform === "string" ? body.platform : "";
    const sender = typeof body?.sender_handle === "string" ? body.sender_handle : "";
    const campaignContext =
      typeof body?.campaign_context === "string" ? body.campaign_context.slice(0, 800) : "";
    const regenerate = Boolean(body?.regenerate);
    const targetLang = detectDominantLanguage(inbound);
    const firstName = sender.trim().split(/[\s_.@]+/)[0] || "";

    const userPrompt = [
      platform ? `Platform: ${platform}` : null,
      firstName ? `Sender first name: ${firstName}` : null,
      campaignContext ? `Campaign context:\n"""${campaignContext}"""` : null,
      `Required reply language: ${
        targetLang === "en" ? "English only" : targetLang === "he" ? "Hebrew only" : "same language as inbound"
      }.`,
      `Inbound comment:\n"""${inbound}"""`,
      regenerate ? "Produce a fresh angle, same rules and tone." : null,
    ].filter(Boolean).join("\n\n");

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
        temperature: regenerate ? 0.95 : 0.7,
      }),
    });

    if (!aiRes.ok) {
      const status = aiRes.status;
      const msg = status === 429
        ? "Rate limited, try again shortly"
        : status === 402
        ? "AI credits exhausted"
        : `AI gateway ${status}`;
      return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const j = await aiRes.json();
    let draft = sanitizeOutboundText(j?.choices?.[0]?.message?.content ?? "");

    if (isLangMismatch(draft, targetLang)) {
      const retry = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `Rewrite the reply in ${
                targetLang === "en"
                  ? "natural English only"
                  : targetLang === "he"
                  ? "natural Hebrew only"
                  : "the same language as the original inbound text only"
              }. Same intent, concise, no language mixing, no explanation. Return only the final reply text.`,
            },
            {
              role: "user",
              content: `Inbound:\n"""${inbound}"""\n\nCurrent draft:\n"""${draft}"""`,
            },
          ],
        }),
      });
      if (retry.ok) {
        const rj = await retry.json();
        draft = sanitizeOutboundText(rj?.choices?.[0]?.message?.content ?? draft);
      }
    }

    if (!draft) {
      return new Response(JSON.stringify({ error: "empty AI reply" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ draft }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

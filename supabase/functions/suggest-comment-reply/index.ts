// Realtyz suggest-comment-reply — generates a single AI draft reply to a
// public social comment in the SAME language as the inbound text. KB-grounded
// broker tone with anti-spam high-entropy phrasing. Pure compose-and-return.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sanitizeOutboundText, detectDominantLanguage } from "../_shared/ayrshare-helpers.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const SYSTEM = `You are the workspace owner's social-engagement voice replying to a single public comment (Facebook, Instagram, etc).

LANGUAGE MIRROR (hard rule, overrides every other rule):
- Detect the dominant language of the inbound text and reply ONLY in that language.
- English in -> English out. Hebrew in -> Hebrew out. Other language in -> same language out.
- Never mix languages. Never append a translation. Never default to Hebrew.

KNOWLEDGE-BASE GROUNDING (highest priority for content):
- Every factual claim, vocabulary choice, value proposition, and recommendation MUST be grounded in the workspace KNOWLEDGE BASE excerpts provided below.
- If the KB does not cover something the user asked, do NOT invent it. Either ask a clarifying question or honestly say you will check and follow up privately.
- Never adopt any legacy persona name; speak as the workspace owner.

ANTI-SPAM HIGH-ENTROPY RULES (Meta-safety; prevents template detection):
- Treat the response as a fingerprint that must be unique vs. all prior replies. NEVER reuse the same opener, the same sentence skeleton, or the same closing question.
- Heavily vary sentence structure, length, vocabulary, register, and rhythm between replies. Mix short punchy sentences with one longer reflective sentence.
- Quote or paraphrase 1-3 specific words/details from THIS commenter's text so the reply is provably context-bound (a name, a city, a budget, a number, a feeling they expressed, a specific question they asked).
- Forbidden generic openers: "Thanks for your comment", "Great question", "Hi there", "Hello", "תודה על התגובה", "שאלה מצוינת", "היי". Find a fresh, specific opener every time.
- The reply must read like a human typing live — small natural asymmetries, varied punctuation cadence, no templated parallelism.

CONTENT GOAL (2 to 4 short sentences total):
1. Open with a concrete, specific hook drawn from the commenter's exact words.
2. Deliver one value-driven insight or honest answer grounded ONLY in the KB.
3. Close with ONE clear, localized Call-To-Action that advances the workspace's current agenda (e.g. invite a DM, propose a short call, point to a specific KB-backed resource). Phrase the CTA differently every single time.

ABSOLUTE PROHIBITIONS:
- No asterisks (*), em-dashes (—), en-dashes (–), double dashes (--), markdown, emojis, hashtags.
- No "I am an AI" / "as a bot" / "automated message" wording.
- No generic platitudes, no scripted/repeating CTAs, no legacy persona name.
- Never invent facts, prices, listings, products, or claims not present in the KB.

GENDER (Hebrew only):
- Match Hebrew gender to the sender's first name when known. Unknown -> masculine singular. Never slash forms like "אתה/את".

Return ONLY the final reply text, nothing else.`;

function isLangMismatch(reply: string, target: "he" | "en" | "other"): boolean {
  if (!reply.trim()) return false;
  const hasHe = /[\u0590-\u05FF]/.test(reply);
  const hasEn = /[A-Za-z]/.test(reply);
  if (target === "en") return hasHe || !hasEn;
  if (target === "he") return hasEn || !hasHe;
  return false;
}

async function loadKbSnippets(admin: ReturnType<typeof createClient>, userId: string | null): Promise<string> {
  if (!userId) return "";
  try {
    const { data } = await admin
      .from("knowledge_chunks")
      .select("content")
      .eq("user_id", userId)
      .limit(8);
    const parts = (data ?? [])
      .map((r: any) => String(r?.content ?? "").trim())
      .filter(Boolean)
      .map((c) => c.slice(0, 600));
    return parts.join("\n---\n").slice(0, 4000);
  } catch {
    return "";
  }
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

    // Resolve workspace user_id (body wins, else from caller JWT) for KB scoping.
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    let userId: string | null = typeof body?.user_id === "string" ? body.user_id : null;
    if (!userId) {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      if (token) {
        try {
          const { data } = await admin.auth.getUser(token);
          userId = data?.user?.id ?? null;
        } catch { /* ignore */ }
      }
    }
    const kbSnippets = await loadKbSnippets(admin, userId);

    // High-entropy seed forces lexical/structural variation across calls.
    const entropySeed = `${crypto.randomUUID()}-${Date.now()}`;

    const userPrompt = [
      platform ? `Platform: ${platform}` : null,
      firstName ? `Sender first name: ${firstName}` : null,
      campaignContext ? `Campaign context:\n"""${campaignContext}"""` : null,
      kbSnippets
        ? `WORKSPACE KNOWLEDGE BASE (ground every assertion strictly in these excerpts; do not invent beyond them):\n"""${kbSnippets}"""`
        : `WORKSPACE KNOWLEDGE BASE: (empty — if the commenter asks a factual question outside general knowledge, honestly say you'll check and follow up in DM).`,
      `Required reply language: ${
        targetLang === "en" ? "English only" : targetLang === "he" ? "Hebrew only" : "same language as inbound"
      }.`,
      `Anti-spam entropy seed (use to vary opener, sentence shapes, vocabulary and CTA wording vs any prior reply): ${entropySeed}`,
      `Reply MUST quote or paraphrase at least one specific detail from the inbound text below so it is provably unique to this commenter.`,
      `Close with ONE clear, localized Call-To-Action advancing the workspace agenda; phrase the CTA differently every time.`,
      `Inbound comment:\n"""${inbound}"""`,
      regenerate ? "Produce a structurally fresh angle: different opener, different sentence count, different CTA shape." : null,
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
        temperature: regenerate ? 1.05 : 0.95,
        top_p: 0.95,
        presence_penalty: 0.6,
        frequency_penalty: 0.8,
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

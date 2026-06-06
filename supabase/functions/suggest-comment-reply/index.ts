// Realtyz suggest-comment-reply — generates a single AI draft reply to a
// public social comment in the SAME language as the inbound text. Grounded in
// workspace KB + live CRM/listings snapshot, locked to the Udi Vitman persona,
// with anti-spam high-entropy phrasing. Pure compose-and-return.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sanitizeOutboundText, detectDominantLanguage } from "../_shared/ayrshare-helpers.ts";
import {
  adminClient,
  loadKbSnippets,
  loadCrmSnapshot,
  renderKbBlock,
  renderCrmBlock,
  UDI_PERSONA,
  ANTI_SPAM_RULES,
  CTA_RULE,
} from "../_shared/grounding.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const SYSTEM = `${UDI_PERSONA}

You are replying to a single public comment (Facebook, Instagram, etc) as Udi Vitman, personally.

LANGUAGE MIRROR (hard rule, overrides every other rule):
- Detect the dominant language of the inbound text and reply ONLY in that language.
- English in -> English out. Hebrew in -> Hebrew out. Other language in -> same language out.
- Never mix languages. Never append a translation. Never default to Hebrew.

MANDATORY MULTI-SOURCE GROUNDING (zero tolerance for invention):
- Every factual claim, vocabulary choice, recommendation MUST be grounded in either [WORKSPACE KNOWLEDGE BASE] excerpts OR the [LIVE PROPERTIES & CRM CONTEXT] block below.
- NEVER invent listings, cities, prices, features, neighborhoods, square meters, room counts. If a fact is not in the two context blocks, do not state it.
- If the KB and CRM do not cover the commenter's question, honestly say you'll verify and follow up in DM. Never fabricate to fill silence.

${ANTI_SPAM_RULES}
- Quote or paraphrase 1-3 specific words/details from THIS commenter's text so the reply is provably context-bound.

CONTENT GOAL (2 to 4 short sentences total):
1. Open with a concrete, specific hook drawn from the commenter's exact words.
2. Deliver one value-driven insight grounded strictly in KB or live CRM data.
3. ${CTA_RULE} The CTA invites a Messenger DM, WhatsApp, or a call to the office.

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

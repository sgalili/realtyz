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
  extractListingTypeFromFeatures,
  UDI_PERSONA,
  ANTI_SPAM_RULES,
  CTA_RULE,
  type ListingType,
} from "../_shared/grounding.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const SYSTEM = `${UDI_PERSONA}

You are replying to a single public social comment (Facebook, Instagram, etc) as the broker, personally and in first person. Your job is to SELL the relevant property, not to introduce Udi as a human.

LANGUAGE MIRROR (hard rule):
- Detect dominant language of the inbound text and reply ONLY in that language. Hebrew in -> Hebrew out. English in -> English out. Never mix, never append translations, never default to Hebrew.

ABSOLUTE PROHIBITIONS (zero tolerance — breaking any of these voids the reply):
- DO NOT mention Udi's biography, background, past management roles, sports, fitness, coaching, USA history, prior careers, personal stories, family, or any third-person facts about him. The KB is for VOICE & domain knowledge only — never for biographical name-dropping.
- DO NOT write the name "אודי ויטמן" / "Udi Vitman" / "Udi" in the body. Write in first person ("אצלי במאגר", "שלחתי לך", "יש לי", "I have", "I just sent you").
- DO NOT use the third person about yourself ("אודי הוא…", "Udi has…"). Never.
- DO NOT use emojis. Maximum 1 emoji per reply, and only if it adds real value. Default: zero emojis.
- DO NOT pad with niceties, slogans, mission statements, or fluff.

MANDATORY MULTI-SOURCE GROUNDING:
- Every property fact (rooms, price, sqm, floor, elevator, parking, neighborhood, street) MUST come from [LIVE PROPERTIES & CRM CONTEXT]. Never invent.
- If the commenter asked a yes/no attribute (elevator? parking? balcony?) and the data is in CRM, answer it directly and truthfully. If not in CRM, pivot to a concrete attribute that IS in CRM (room count, price, street, floor) without claiming the unknown attribute exists.
- If the KB and CRM truly cannot answer, say honestly you'll verify and follow up in DM. Never fabricate.

OUTPUT FORMAT (STRICT JSON, no markdown, no code fence, no commentary):
{
  "public_comment": "<1 to 2 SHORT sentences max. Direct answer to the commenter's explicit question using real attributes from CRM. End with exactly this closing in the matched language. Hebrew closing: 'שלחתי לך את כל הפרטים המלאים והתמונות ישירות לפרטי / למסנג'ר. כנס לבדוק.' English closing: 'I just sent you the full details and photos straight to your DM / Messenger. Check it out.'>",
  "private_messenger_dm": "<3 to 5 short lines. Detail the SPECIFIC property the commenter is asking about using CRM facts (rooms, sqm, floor, price, street/neighborhood, key features). Then offer exactly ONE alternative listing from CRM within ~15% of the same price band, named with its real city/street and price. Close with exactly ONE high-yield qualifying question (move-in date, exact budget ceiling, parking requirement, floor preference, must-have neighborhoods). No emojis. No biography. First person.>"
}

GENDER (Hebrew only): match Hebrew gender to the sender's first name when known; unknown -> masculine singular. Never slash forms.

${ANTI_SPAM_RULES}
- Quote or paraphrase 1-2 specific words from THIS commenter's text in the public_comment so it is provably context-bound.

Return ONLY the raw JSON object described above. Nothing else.`;

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
    const [kbSnippets, crmSnap] = await Promise.all([
      loadKbSnippets(admin, userId),
      loadCrmSnapshot(admin, userId),
    ]);

    // High-entropy seed forces lexical/structural variation across calls.
    const entropySeed = `${crypto.randomUUID()}-${Date.now()}`;

    const userPrompt = [
      platform ? `Platform: ${platform}` : null,
      firstName ? `Sender first name: ${firstName}` : null,
      campaignContext ? `Campaign context:\n"""${campaignContext}"""` : null,
      renderCrmBlock(crmSnap),
      renderKbBlock(kbSnippets),
      `Required reply language: ${
        targetLang === "en" ? "English only" : targetLang === "he" ? "Hebrew only" : "same language as inbound"
      }.`,
      `Anti-spam entropy seed (use to vary opener, sentence shapes, vocabulary and CTA wording vs any prior reply): ${entropySeed}`,
      `Reply MUST quote or paraphrase at least one specific detail from the inbound text below so it is provably unique to this commenter.`,
      `CTA invites Messenger DM, WhatsApp, or office call — phrase differently every time.`,
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
        presence_penalty: 0.7,
        frequency_penalty: 0.85,
        max_tokens: 500,
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
    const raw = String(j?.choices?.[0]?.message?.content ?? "").trim();

    // Strip accidental markdown code fences and extract first JSON object.
    function parseSplit(text: string): { public_comment: string; private_messenger_dm: string } | null {
      if (!text) return null;
      let t = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const start = t.indexOf("{");
      const end = t.lastIndexOf("}");
      if (start < 0 || end <= start) return null;
      try {
        const obj = JSON.parse(t.slice(start, end + 1));
        const pub = sanitizeOutboundText(String(obj?.public_comment ?? "")).trim();
        const dm = sanitizeOutboundText(String(obj?.private_messenger_dm ?? "")).trim();
        if (!pub) return null;
        return { public_comment: pub, private_messenger_dm: dm };
      } catch {
        return null;
      }
    }

    let split = parseSplit(raw);
    // Fallback: treat the whole response as the public_comment if JSON parsing failed.
    if (!split) {
      const pub = sanitizeOutboundText(raw);
      split = { public_comment: pub, private_messenger_dm: "" };
    }

    if (isLangMismatch(split.public_comment, targetLang)) {
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
              content: `Rewrite BOTH fields in ${
                targetLang === "en"
                  ? "natural English only"
                  : targetLang === "he"
                  ? "natural Hebrew only"
                  : "the same language as the original inbound text only"
              }. Return STRICT JSON {"public_comment": "...", "private_messenger_dm": "..."}. No mixing, no explanation, no code fence.`,
            },
            {
              role: "user",
              content: `Inbound:\n"""${inbound}"""\n\nCurrent draft JSON:\n${JSON.stringify(split)}`,
            },
          ],
        }),
      });
      if (retry.ok) {
        const rj = await retry.json();
        const retried = parseSplit(String(rj?.choices?.[0]?.message?.content ?? ""));
        if (retried) split = retried;
      }
    }

    if (!split.public_comment) {
      return new Response(JSON.stringify({ error: "empty AI reply" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        // Backward compat: existing UI reads `draft` for the public comment textarea.
        draft: split.public_comment,
        public_comment: split.public_comment,
        private_messenger_dm: split.private_messenger_dm,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

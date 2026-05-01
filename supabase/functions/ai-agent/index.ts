import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  COMPLIANCE_PROMPT,
  classifyEscalation,
  factCheckDraft,
  renderListingFacts,
  type ListingFact,
} from "../_shared/guardrails.ts";
import { loadAgentPersona, renderPersonaPrompt, renderDealTypeBlock, type DealType } from "../_shared/persona.ts";
import { maskMessages } from "../_shared/pii.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SCHEMA_CONTEXT = `
You are the Agent's Virtual Twin, drafting messages AS the human Agent (e.g. "Udi") to Prospects in the real-estate Deal Room. You are NEVER "Realtyz AI", a chatbot, or a generic assistant, your identity, voice and signature are ALWAYS the human Agent's. The PERSONA OVERRIDE block below is the source of truth for your identity.
You speak Hebrew and English. You are sharp, professional, warm, and consultative, strictly on real-estate topics.

You have read access (SELECT only) to a PostgreSQL database with these tables:

TABLE leads (Prospects): id (uuid PK), phone_number (text), full_name (text), city (text), interest_tag (text), engagement_score (int 0-100), status (text), is_voted (bool), last_interaction_at (timestamptz), created_at (timestamptz), loyalty_tier (text), sentiment (text: positive/neutral/negative), identity_number (text), ai_autopilot (bool), lead_stage (text), preferences (jsonb), deal_type (text: 'sale' | 'rent', STRICT pipeline separator)

TABLE chat_history: id (uuid PK), lead_id (uuid FK->leads), role (text: user/assistant), content (text), sentiment (text), created_at (timestamptz)

TABLE messages: id (uuid PK), lead_id (uuid FK->leads), channel (text), content (text), sender_type (text), direction (text: inbound/outbound), platform (text), created_at (timestamptz), metadata (jsonb)

TABLE listings: id (uuid PK), property_title (text), description (text), asking_price (numeric), features (jsonb), slug (text), is_published (bool), user_id (uuid), created_at (timestamptz)

TABLE campaigns (Listing Outreach): id (uuid PK), name (text), description (text), sms_body (text), tag_associated (text), total_clicks (int), total_sent (int), created_at (timestamptz)

TABLE contact_submissions: id (uuid PK), full_name (text), phone_number (text), email (text), message (text), tag (text), status (text), wa_sent (bool), created_at (timestamptz)

CRITICAL QUERY RULES:
- ONLY generate SELECT queries. Never INSERT, UPDATE, DELETE, DROP, ALTER, or any DDL/DML.
- ALWAYS add "LIMIT 50" to every query. Never return more than 50 rows.
- For aggregations (COUNT, SUM, AVG), GROUP BY results should also have LIMIT 50.
- Use indexed columns for WHERE clauses when possible: phone_number, city, status, engagement_score, created_at, fts.
- Never SELECT * from leads without a WHERE clause - always filter or limit.
- Return valid PostgreSQL SQL.

DEAL-ROOM REPLY MODE, KB-FIRST GROUNDING (RAG):
The Knowledge Base context block below was retrieved by a vector search over the Agent's own
uploads (CV, professional bio, neighbourhood notes, listing playbooks) and past WhatsApp /
mobile chat conversations BEFORE this prompt was assembled. The KB is the AUTHORITATIVE
source of the Agent's voice, professional background, and local expertise.

KB-FIRST PRIORITY (apply in this order, see VIRTUAL TWIN block for the full rule):
  1. AGENT PERSONA DATA, CV / bio / "About me" docs (WHO you are, expertise, patches).
  2. COMMUNICATION HISTORY, WhatsApp & mobile chat patterns (HOW you write).
  3. PROPERTY DATA, the lead's preferences + the listings table (WHAT you sell).

Behaviour:
- TREAT the WhatsApp / mobile chat excerpts as the Agent's authentic voice and proven playbook.
- MIRROR the Agent's tone, sentence length, greeting/closing patterns, emoji usage, slang, and
  Hebrew real-estate phrasing exactly. If the Agent is direct, BE direct. If they use specific
  slang, REUSE it verbatim when it fits.
- LIFT objection-handling moves and successful closing lines from past chats and adapt them.
- For ANY question about background / years of experience / past deals / local market knowledge:
  ANSWER FROM THE KB. If the KB does not contain the answer, do NOT guess. Respond honestly in
  the Agent's own voice that you'll check and get back, e.g.:
    "תן לי לבדוק את זה ולחזור אליך עם תשובה מדויקת."
- NEVER invent property facts (price, address, dates, sold-prices, school zones, fees) that
  aren't in the KB, the Prospect record, or the listings table.
- Prefer chunks tagged "Past Conversation / WhatsApp" for STYLE & objection moves; prefer
  document chunks for FACTS (bio, expertise, neighbourhood notes).
- If the KB context block is empty / irrelevant: still stay in character as the Agent, keep the
  reply short and professional, and offer to follow up, DO NOT fall back to a generic
  AI-assistant tone, marketing slogans, or made-up details.

AGENT CONTEXT (loaded from settings):
{{CAMPAIGN_CONTEXT}}

KNOWLEDGE BASE CONTEXT (top vector-search matches from the Agent's own uploads, CV / bio / past WhatsApp turns + reference docs):
{{KB_CONTEXT}}

KB CITATION RULES:
- When the answer leans on the KB above, cite inline in Hebrew like: "בהתאם לסגנון מהשיחה «{title}»" or "לפי המסמך «{title}»".
- Do NOT invent sources. Only cite titles that appear in the KB context block.
- If the KB context is empty or irrelevant, answer briefly in the Agent's voice and offer to
  follow up, without citing.

RESPONSE FORMAT (JSON):
If you can answer with SQL:
{"type":"sql","query":"SELECT ...","explanation":"הסבר קצר בעברית עם המלצה אסטרטגית"}

If you need to respond with text only (advice, suggested reply, strategy, interpretation):
{"type":"text","content":"תשובה בעברית בסגנון של הסוכן"}

IMPORTANT: Return ONLY the JSON object, no markdown, no code fences.
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { messages, lead_id, prospect_name } = body ?? {};
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load Agent settings (real-estate). The legacy `campaign_settings` table is
    // kept for backward compat but only the AI tone is used; political fields
    // (mandate_target, current_focus) are intentionally ignored.
    const { data: settingsRows } = await supabase
      .from("campaign_settings")
      .select("key, value");
    const settings = Object.fromEntries(
      (settingsRows ?? []).map((r: any) => [r.key, r.value])
    );

    const campaignContext = settings.ai_tone
      ? `AI Tone: ${settings.ai_tone}`
      : "Default tone: warm, professional Israeli real-estate Agent.";

    // RAG: pull KB chunks for the *requesting* user (auth header forwarded).
    // We fetch a wider window then split into "Past Conversation (WhatsApp)" vs "Reference Documents",
    // so the model can mirror the Agent's voice from past WhatsApp turns while citing factual docs.
    let kbContext = "(no Knowledge Base entries matched, answer briefly in the Agent's voice and offer to follow up; do NOT invent facts)";
    let kbSources: Array<{ id: string; title: string; similarity: number; source?: string }> = [];
    try {
      const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user")?.content;
      const authHeader = req.headers.get("Authorization") ?? "";
      if (lastUserMsg && authHeader.startsWith("Bearer ")) {
        const kbRes = await fetch(`${supabaseUrl}/functions/v1/kb-query`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader },
          body: JSON.stringify({ query: lastUserMsg, match_count: 10 }),
        });
        if (kbRes.ok) {
          const kbJson = await kbRes.json();
          const matches: any[] = kbJson?.matches ?? [];
          if (matches.length > 0) {
            // Hydrate source metadata so we can label WhatsApp chunks distinctly.
            const docIds = Array.from(new Set(matches.map((m) => m.document_id).filter(Boolean)));
            const { data: docs } = await supabase
              .from("knowledge_documents")
              .select("id, source_type, source_metadata")
              .in("id", docIds.length ? docIds : ["00000000-0000-0000-0000-000000000000"]);
            const docMap = new Map<string, { source_type?: string; source_metadata?: any }>();
            (docs ?? []).forEach((d: any) => docMap.set(d.id, d));

            const enriched = matches.map((m) => {
              const d = docMap.get(m.document_id) ?? {};
              const isWhatsApp =
                d.source_type === "whatsapp" ||
                d.source_metadata?.source === "WhatsApp" ||
                d.source_metadata?.category === "Past Conversation";
              return { ...m, isWhatsApp, sourceLabel: isWhatsApp ? "Past Conversation / WhatsApp" : "Reference Document" };
            });

            // Prefer up to 4 WhatsApp chunks for STYLE, then up to 4 doc chunks for FACTS.
            const wa = enriched.filter((m) => m.isWhatsApp).slice(0, 4);
            const docsChunks = enriched.filter((m) => !m.isWhatsApp).slice(0, 4);
            const ordered = [...wa, ...docsChunks];

            const fmt = (m: any, i: number) =>
              `[${i + 1}] (${m.sourceLabel}) title: "${m.document_title}" (similarity ${(m.similarity ?? 0).toFixed(2)})\n${m.content}`;
            const waBlock = wa.length
              ? `  PAST WHATSAPP CONVERSATIONS (use for STYLE / VOICE)  \n${wa.map((m, i) => fmt(m, i)).join("\n\n---\n\n")}`
              : "";
            const docsBlock = docsChunks.length
              ? `  REFERENCE DOCUMENTS (use for FACTS)  \n${docsChunks.map((m, i) => fmt(m, i + wa.length)).join("\n\n---\n\n")}`
              : "";
            kbContext = [waBlock, docsBlock].filter(Boolean).join("\n\n");

            const seen = new Map<string, { id: string; title: string; similarity: number; source?: string }>();
            ordered.forEach((m) => {
              const id = m.document_id ?? m.id;
              const sim = m.similarity ?? 0;
              if (!seen.has(id) || (seen.get(id)!.similarity < sim)) {
                seen.set(id, { id, title: m.document_title, similarity: sim, source: m.sourceLabel });
              }
            });
            kbSources = Array.from(seen.values()).slice(0, 6);
          }
        }
      }
    } catch (e) {
      console.warn("kb-query failed, continuing without KB:", e);
    }

    // Compliance Guardrails: load the user's verified listings (Homely-synced via the
    // `listings` table) and inject them into the system prompt so the AI can only
    // reference real prices/titles. We forward the auth header so RLS scopes results.
    let listingFacts: ListingFact[] = [];
    try {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (authHeader.startsWith("Bearer ")) {
        const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: lst } = await userClient
          .from("listings")
          .select("id, property_title, asking_price, slug")
          .eq("is_published", true)
          .limit(50);
        listingFacts = (lst || []) as ListingFact[];
      }
    } catch (e) {
      console.warn("listing fact-load failed:", e);
    }

    const compliance = COMPLIANCE_PROMPT.replace(
      "{{LISTING_FACTS}}",
      renderListingFacts(listingFacts),
    );

    // Virtual Twin persona, every drafted reply must sound like THIS Agent.
    const persona = await loadAgentPersona(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      req.headers.get("Authorization") ?? "",
    );
    const personaBlock = renderPersonaPrompt(persona);

    // Hard pipeline separation, fetch the Lead's deal_type and inject a
    // forbid-list so the AI cannot offer mortgages to renters or rentals to buyers.
    let dealType: DealType | null = null;
    let resolvedLeadName: string | null = prospect_name ?? null;
    if (lead_id) {
      try {
        const { data: leadRow } = await supabase
          .from("leads")
          .select("deal_type, full_name, preferences")
          .eq("id", lead_id)
          .maybeSingle();
        const dt =
          (leadRow?.deal_type as string | undefined) ||
          (leadRow?.preferences as any)?.listing_type;
        if (dt === "sale" || dt === "rent") dealType = dt;
        if (!resolvedLeadName) resolvedLeadName = (leadRow?.full_name as string | undefined) ?? null;
      } catch (e) {
        console.warn("deal_type lookup failed:", e);
      }
    }
    const dealTypeBlock = renderDealTypeBlock(dealType, resolvedLeadName);

    const systemPrompt = SCHEMA_CONTEXT
      .replace("{{CAMPAIGN_CONTEXT}}", campaignContext)
      .replace("{{KB_CONTEXT}}", kbContext)
      + (personaBlock ? "\n\n" + personaBlock : "")
      + "\n\n" + dealTypeBlock
      + "\n\n" + compliance;

    // Escalation Trigger: classify the most recent prospect/user message.
    // When a high-risk topic is detected, fire-and-forget the alert function
    // so the human Agent gets a WhatsApp ping while we still draft a safe reply.
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user")?.content;
    let escalation: any = null;
    if (lastUserMsg) {
      const hit = classifyEscalation(String(lastUserMsg));
      if (hit) {
        escalation = hit;
        const authHeader = req.headers.get("Authorization") ?? "";
        if (authHeader.startsWith("Bearer ")) {
          // Fire & forget, we don't await so it doesn't block the reply.
          fetch(`${supabaseUrl}/functions/v1/escalation-alert`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: authHeader },
            body: JSON.stringify({
              prospect_message: String(lastUserMsg).slice(0, 4000),
              category: hit.category,
              matched_keywords: hit.matched,
              severity: hit.severity,
              channel: "deal_room",
            }),
          }).catch((e) => console.warn("escalation-alert dispatch failed:", e));
        }
      }
    }


    // Step 1: Ask AI to generate SQL or text response
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          // PII MASKING (Compliance Layer): scrub IDs / cards / IBANs /
          // emails / phones from the chat history before it leaves our
          // backend. The originals stay in Supabase for the human Agent.
          ...maskMessages(messages as Array<{ role: string; content: string }>).messages,
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "מגבלת בקשות, נסה שוב בעוד רגע" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "נדרשת הוספת קרדיטים ל-AI" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content?.trim() || "";

    // Parse AI response
    let parsed;
    try {
      const cleaned = rawContent.replace(/^```(?:json)?\n?/gm, "").replace(/\n?```$/gm, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(JSON.stringify({
        type: "text",
        content: rawContent,
        escalation,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (parsed.type === "text") {
      // Fact-check the AI's draft against verified listings.
      const fact_violations = factCheckDraft(String(parsed.content || ""), listingFacts);
      return new Response(JSON.stringify({ ...parsed, sources: kbSources, escalation, fact_violations }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Execute the SQL query with safety checks
    if (parsed.type === "sql" && parsed.query) {
      let query = parsed.query.trim();

      // Security: only allow SELECT
      if (!query.toUpperCase().startsWith("SELECT")) {
        return new Response(JSON.stringify({
          type: "text",
          content: "⛔ מותר רק שאילתות קריאה (SELECT). פעולה זו נחסמה.",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Force LIMIT if missing
      if (!/\bLIMIT\s+\d+/i.test(query)) {
        query = query.replace(/;?\s*$/, " LIMIT 50");
      } else {
        // Cap existing LIMIT to 50
        query = query.replace(/\bLIMIT\s+(\d+)/i, (_, n) => `LIMIT ${Math.min(parseInt(n), 50)}`);
      }

      const { data, error } = await supabase.rpc("execute_readonly_query", {
        query_text: query,
      });

      if (error) {
        return new Response(JSON.stringify({
          type: "error",
          content: `שגיאה בביצוע השאילתה: ${error.message}`,
          query,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        type: "data",
        data: data,
        query,
        explanation: parsed.explanation || "",
        sources: kbSources,
        escalation,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      type: "text",
      content: rawContent,
      escalation,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-agent error:", e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

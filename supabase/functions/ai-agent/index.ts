import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SCHEMA_CONTEXT = `
You are the "Kalpiz Intelligence Officer" - the AI brain behind a political campaign management platform called Kalpiz AI.
You speak Hebrew and English. You are sharp, professional, and data-driven.
You are also a Master Campaign Strategist - you don't just return data, you provide actionable campaign advice.

You have access to a PostgreSQL database with these tables:

TABLE voters: id (uuid PK), phone_number (text), full_name (text), city (text), interest_tag (text), engagement_score (int 0-100), status (text: lead/supporter/active/inactive/contacted/voted), is_voted (bool), last_interaction_at (timestamptz), created_at (timestamptz), loyalty_tier (text), sentiment (text: positive/neutral/negative), identity_number (text), ai_autopilot (bool)

TABLE chat_history: id (uuid PK), lead_id (uuid FK->voters), role (text: user/assistant), content (text), sentiment (text), created_at (timestamptz)

TABLE messages: id (uuid PK), lead_id (uuid FK->voters), channel (text), content (text), sender_type (text), direction (text: inbound/outbound), platform (text), created_at (timestamptz), metadata (jsonb)

TABLE campaigns: id (uuid PK), name (text), description (text), sms_body (text), tag_associated (text), total_clicks (int), total_sent (int), created_at (timestamptz)

TABLE leads: id (uuid PK), full_name (text), phone_number (text), email (text), message (text), tag (text), status (text), wa_sent (bool), created_at (timestamptz)

TABLE tracking_links: id (uuid PK), target_url (text), short_code (text), tag (text), campaign_id (uuid FK->campaigns), click_count (int), created_at (timestamptz)

TABLE campaign_settings: id (uuid PK), key (text UNIQUE), value (text), updated_at (timestamptz)

CRITICAL QUERY RULES:
- ONLY generate SELECT queries. Never INSERT, UPDATE, DELETE, DROP, ALTER, or any DDL/DML.
- ALWAYS add "LIMIT 50" to every query. Never return more than 50 rows.
- For aggregations (COUNT, SUM, AVG), GROUP BY results should also have LIMIT 50.
- Use indexed columns for WHERE clauses when possible: phone_number, city, status, engagement_score, created_at, fts.
- For large scans, prefer COUNT(*) or aggregations over SELECT *.
- Never SELECT * from voters without a WHERE clause - always filter or limit.
- Return valid PostgreSQL SQL.

STRATEGIC ADVICE:
When the user asks for analysis or strategy, don't just return data - interpret it.
Give actionable recommendations in Hebrew. Think like a campaign manager advising a candidate.

CAMPAIGN CONTEXT (loaded from settings):
{{CAMPAIGN_CONTEXT}}

KNOWLEDGE BASE CONTEXT (top matches from the campaign's own documents):
{{KB_CONTEXT}}

KNOWLEDGE-BASE CITATION RULES:
- When the answer relies on the knowledge base above, cite the source inline in Hebrew like: "לפי המסמך הרשמי של הקמפיין «{title}»".
- Do NOT invent sources. Only cite titles that appear in the KB context block.
- If the KB context is empty or irrelevant, answer from your general reasoning without citing.

RESPONSE FORMAT (JSON):
If you can answer with SQL:
{"type":"sql","query":"SELECT ...","explanation":"הסבר קצר בעברית עם המלצה אסטרטגית"}

If you need to respond with text only (advice, strategy, interpretation):
{"type":"text","content":"תשובה בעברית עם המלצות"}

IMPORTANT: Return ONLY the JSON object, no markdown, no code fences.
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
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

    // Load campaign settings for context
    const { data: settingsRows } = await supabase
      .from("campaign_settings")
      .select("key, value");
    const settings = Object.fromEntries(
      (settingsRows ?? []).map((r: any) => [r.key, r.value])
    );

    const campaignContext = [
      settings.ai_tone ? `AI Tone: ${settings.ai_tone}` : null,
      settings.current_focus ? `Current Focus: ${settings.current_focus}` : null,
      settings.mandate_target ? `Mandate Target: ${settings.mandate_target} mandates` : null,
    ].filter(Boolean).join("\n") || "No campaign settings configured yet.";

    // RAG: pull top-5 KB chunks for the *requesting* user (auth header forwarded)
    let kbContext = "(no knowledge base documents matched)";
    let kbSources: Array<{ id: string; title: string; similarity: number }> = [];
    try {
      const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user")?.content;
      const authHeader = req.headers.get("Authorization") ?? "";
      if (lastUserMsg && authHeader.startsWith("Bearer ")) {
        const kbRes = await fetch(`${supabaseUrl}/functions/v1/kb-query`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader },
          body: JSON.stringify({ query: lastUserMsg, match_count: 5 }),
        });
        if (kbRes.ok) {
          const kbJson = await kbRes.json();
          const matches = kbJson?.matches ?? [];
          if (matches.length > 0) {
            kbContext = matches
              .map((m: any, i: number) => `[${i + 1}] title: "${m.document_title}" (similarity ${(m.similarity ?? 0).toFixed(2)})\n${m.content}`)
              .join("\n\n---\n\n");
            // Dedupe sources by document_id, keep highest similarity
            const seen = new Map<string, { id: string; title: string; similarity: number }>();
            matches.forEach((m: any) => {
              const id = m.document_id ?? m.id;
              const sim = m.similarity ?? 0;
              if (!seen.has(id) || (seen.get(id)!.similarity < sim)) {
                seen.set(id, { id, title: m.document_title, similarity: sim });
              }
            });
            kbSources = Array.from(seen.values()).slice(0, 5);
          }
        }
      }
    } catch (e) {
      console.warn("kb-query failed, continuing without KB:", e);
    }

    const systemPrompt = SCHEMA_CONTEXT
      .replace("{{CAMPAIGN_CONTEXT}}", campaignContext)
      .replace("{{KB_CONTEXT}}", kbContext);

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
          ...messages,
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
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (parsed.type === "text") {
      return new Response(JSON.stringify({ ...parsed, sources: kbSources }), {
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
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      type: "text",
      content: rawContent,
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

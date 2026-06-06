// learn-from-edit — captures broker corrections of AI-generated text and
// extracts a concise rule that future persona prompts can rely on.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

type EditPair = { label: string; original: string; edited: string };

async function extractRule(pairs: EditPair[]): Promise<string | null> {
  const meaningful = pairs.filter(p => p.original.trim() && p.edited.trim() && p.original.trim() !== p.edited.trim());
  if (meaningful.length === 0) return null;

  const body = meaningful.map(p =>
    `[${p.label}]\nORIGINAL_AI:\n${p.original}\n\nUSER_EDITED:\n${p.edited}`
  ).join("\n\n---\n\n");

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "You analyze how a real-estate broker edits AI-drafted replies. Output ONE concise English rule (max 220 chars) capturing the broker's correction (tone, vocabulary, factual override, formatting, length, CTA). No preface, no quotes, no markdown. Start with an imperative verb. Examples: 'Replace \"sale\" with \"rent\" when listing is a rental.' / 'Soften CTA: replace direct \"call me\" with \"happy to chat when convenient\".' / 'Drop hype emoji from openings.'",
          },
          { role: "user", content: body },
        ],
        temperature: 0.2,
        max_tokens: 120,
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const rule = String(j?.choices?.[0]?.message?.content ?? "").trim().replace(/^["'`]+|["'`]+$/g, "");
    return rule || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "auth required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: u } = await userClient.auth.getUser();
    const user_id = u?.user?.id;
    if (!user_id) {
      return new Response(JSON.stringify({ error: "invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const listing_id: string | null = body?.listing_id ?? null;
    const context: string | null = body?.context ?? null;
    const pairs: EditPair[] = Array.isArray(body?.pairs) ? body.pairs : [];

    const meaningful = pairs.filter(p =>
      typeof p?.original === "string" && typeof p?.edited === "string" &&
      p.original.trim() && p.edited.trim() && p.original.trim() !== p.edited.trim()
    );
    if (meaningful.length === 0) {
      return new Response(JSON.stringify({ status: "noop" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rule = await extractRule(meaningful);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const rows = meaningful.map(p => ({
      user_id,
      listing_id,
      context: [context, p.label].filter(Boolean).join(" / ") || null,
      original_ai_text: p.original.trim(),
      user_edited_text: p.edited.trim(),
      extracted_rule_insight: rule,
    }));
    const { error } = await admin.from("agent_learning_lexicon").insert(rows);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ status: "captured", count: rows.length, rule }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

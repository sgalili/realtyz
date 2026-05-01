// Smart Matchmaker — AI draft for sharing a property
//
// Drafts a professional WhatsApp message that introduces a specific property
// to a prospect, weaving in a personal note based on their recent chat history.
// Uses Lovable AI Gateway (Gemini 2.5 Flash by default).
//
// Request body:
//   {
//     prospect_id: uuid,
//     property: PropertyResult   // produced by homely-search
//   }
//
// Returns: { draft: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { loadAgentPersona, renderPersonaPrompt } from "../_shared/persona.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatPrice(price: number | null, currency = "₪") {
  if (!price) return "—";
  return `${currency}${Number(price).toLocaleString("he-IL")}`;
}

function localFallbackDraft(prospect: any, property: any) {
  const name = prospect?.full_name?.split(" ")?.[0] || "שלום";
  const title = property?.title || "נכס חדש";
  const price = formatPrice(property?.price, property?.currency || "₪");
  const desc = (property?.description || "").slice(0, 200);
  const lines = [
    `היי ${name},`,
    ``,
    `מצאתי נכס שעשוי להתאים לכם בדיוק:`,
    `🏡 ${title}`,
    `💰 ${price}`,
    property?.city ? `📍 ${property.city}` : null,
    property?.rooms ? `🛏️ ${property.rooms} חדרים` : null,
    desc ? `\n${desc}` : null,
    `\nאשמח לקבוע סיור — מתי נוח לכם?`,
  ].filter(Boolean);
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { prospect_id, property } = await req.json().catch(() => ({} as any));
    if (!prospect_id || !property) {
      return json({ error: "prospect_id and property are required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load the prospect + recent history for personalization
    const { data: prospect } = await admin
      .from("leads")
      .select("id, full_name, city, interest_tag, preferences, lead_stage, loyalty_tier")
      .eq("id", prospect_id)
      .maybeSingle();

    const { data: recentMsgs } = await admin
      .from("messages")
      .select("content, direction, created_at")
      .eq("lead_id", prospect_id)
      .order("created_at", { ascending: false })
      .limit(8);

    const historySummary = (recentMsgs || [])
      .reverse()
      .map((m) => `[${m.direction}] ${String(m.content || "").slice(0, 200)}`)
      .join("\n");

    // If the AI gateway isn't configured, return a polished fallback
    if (!LOVABLE_API_KEY) {
      return json({ draft: localFallbackDraft(prospect, property) });
    }

    const persona = await loadAgentPersona(
      SUPABASE_URL,
      ANON_KEY,
      req.headers.get("Authorization") ?? "",
    );
    const personaBlock = renderPersonaPrompt(persona);

    const systemPrompt = [
      "You are a senior Israeli real-estate agent writing a WhatsApp message in Hebrew.",
      "Tone: warm, professional, concise (max ~6 short lines).",
      "Goal: introduce ONE property to the prospect and propose a viewing.",
      "Hard rules:",
      "- Always include the property title, price, city (if known), and rooms (if known).",
      "- Weave in ONE personal touch derived from the prospect's recent chat history if relevant.",
      "- Do NOT invent facts (price, address, features). Use only what is provided.",
      "- Do NOT promise legal/financial outcomes or guarantee a closing date.",
      "- End with a single soft call-to-action (suggest a viewing).",
      "- Output Hebrew text only — no markdown, no preamble, no explanations.",
      personaBlock ? "\n" + personaBlock : "",
    ].join("\n");

    const userPrompt = [
      `Prospect:`,
      `  Name: ${prospect?.full_name || "—"}`,
      `  City: ${prospect?.city || "—"}`,
      `  Interest tag: ${prospect?.interest_tag || "—"}`,
      `  Stage: ${prospect?.lead_stage || "—"}`,
      `  Preferences (JSON): ${JSON.stringify(prospect?.preferences || {})}`,
      ``,
      `Property to share:`,
      `  Title: ${property.title}`,
      `  Price: ${formatPrice(property.price, property.currency)}`,
      `  City: ${property.city || "—"}`,
      `  Rooms: ${property.rooms ?? "—"}`,
      `  Size: ${property.size_sqm ? `${property.size_sqm} sqm` : "—"}`,
      `  Features: ${(property.features || []).slice(0, 6).join(", ") || "—"}`,
      `  Description: ${(property.description || "").slice(0, 600)}`,
      ``,
      `Recent conversation (oldest → newest):`,
      historySummary || "(no prior messages)",
      ``,
      `Draft the WhatsApp message now.`,
    ].join("\n");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (aiRes.status === 429) {
      return json({ error: "Rate limits exceeded, please try again later." }, 429);
    }
    if (aiRes.status === 402) {
      return json(
        { error: "Payment required, please add funds to your Lovable AI workspace." },
        402,
      );
    }
    if (!aiRes.ok) {
      console.warn("[draft-property-share] AI gateway error", aiRes.status);
      return json({ draft: localFallbackDraft(prospect, property) });
    }

    const payload = await aiRes.json();
    const draft: string =
      payload?.choices?.[0]?.message?.content?.trim() ||
      localFallbackDraft(prospect, property);

    return json({ draft });
  } catch (e) {
    console.error("[draft-property-share] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});

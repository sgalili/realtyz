import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "https://esm.sh/zod@3.25.76";
import {
  COMPLIANCE_PROMPT,
  factCheckDraft,
  renderListingFacts,
  type ListingFact,
} from "../_shared/guardrails.ts";
import { loadAgentPersona, renderPersonaPrompt } from "../_shared/persona.ts";
import { fetchSystemRulesBlock } from "../_shared/system-rules.ts";
import { enforceOwnerLaws, fetchOwnerBranding, stripStreetNumbers } from "../_shared/owner-laws.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  lead_id: z.string().uuid(),
  listing_id: z.string().min(1),
  listing_source: z.enum(["internal", "homely"]).default("internal"),
  channel: z.enum(["whatsapp", "email", "sms"]).default("whatsapp"),
  agent_note: z.string().max(500).optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { lead_id, listing_id, listing_source, channel, agent_note } = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch lead
    const { data: lead, error: pErr } = await supabase
      .from("leads")
      .select("id, full_name, phone_number, city, interest_tag, preferences, lead_stage")
      .eq("id", lead_id)
      .maybeSingle();
    if (pErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch listing — internal or via Homely proxy
    let listing: {
      title: string;
      description: string;
      price: string | number | null;
      features: unknown;
      url?: string | null;
      project_name?: string | null;
    };

    if (listing_source === "internal") {
      const { data: l, error: lErr } = await supabase
        .from("listings")
        .select("property_title, description, asking_price, features, slug, city, neighborhood, address, rooms, sqm, floor, parking, elevator, project_name")
        .eq("id", listing_id)
        .maybeSingle();
      if (lErr || !l) {
        return new Response(JSON.stringify({ error: "Listing not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      listing = {
        title: l.property_title,
        description: l.description,
        price: l.asking_price,
        features: { ...(Array.isArray(l.features) ? (l.features[0] ?? {}) : (l.features ?? {})), city: l.city, neighborhood: l.neighborhood, address: l.address, rooms: l.rooms, sqm: l.sqm, floor: l.floor, parking: l.parking, elevator: l.elevator },
        url: l.slug ? `/p/${l.slug}` : null,
        project_name: (l as any).project_name ?? null,
      };
    } else {
      // Homely via proxy
      const homelyResp = await fetch(`${supabaseUrl}/functions/v1/call-homely-api`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ path: `/listings/${listing_id}`, method: "GET" }),
      });
      if (!homelyResp.ok) {
        const t = await homelyResp.text();
        return new Response(
          JSON.stringify({ error: "Failed to fetch Homely listing", detail: t }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const h = await homelyResp.json();
      const data = h?.data ?? h;
      listing = {
        title: data?.title || data?.address || "Listing",
        description: data?.description || data?.summary || "",
        price: data?.price ?? data?.asking_price ?? null,
        features: data?.features || data?.amenities || [],
        url: data?.url || null,
      };
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const channelGuide: Record<string, string> = {
      whatsapp: "Conversational, 3–5 short lines, friendly Hebrew, one clear call-to-action. Allowed light emojis (🏡, ✨). End with the agent offering a viewing.",
      email: "Subject line + body. Professional but warm Hebrew. 1 short paragraph hook, 3–5 bullet highlights, closing CTA. Sign off as the Agent.",
      sms: "Max 320 chars Hebrew. Single message, one CTA, no emojis.",
    };

    // Compliance: inject the verified listing facts and forbidden-topic block.
    const factListing: ListingFact[] = [
      {
        id: String(listing_id),
        property_title: listing.title,
        asking_price: listing.price == null ? null : Number(listing.price),
      },
    ];
    const compliance = COMPLIANCE_PROMPT.replace(
      "{{LISTING_FACTS}}",
      renderListingFacts(factListing),
    );

    const persona = await loadAgentPersona(supabaseUrl, anonKey, authHeader);
    const personaBlock = renderPersonaPrompt(persona);

    const systemPrompt = `You are an elite Israeli real-estate Agent's writing assistant for Realtyz AI.
Write a personalized outreach in Hebrew that introduces a specific listing to a specific Lead.
Match the Lead's interests and city. Never invent facts not present in the listing data.
Channel format: ${channel.toUpperCase()} — ${channelGuide[channel]}
Output JSON ONLY via the provided tool — no extra text.

${personaBlock ? personaBlock + "\n\n" : ""}${compliance}`;

    // Owner standing orders (workspace-level) — must override persona + compliance defaults.
    let systemRulesBlock = "";
    try {
      systemRulesBlock = await fetchSystemRulesBlock(
        userData.user.id,
        `outreach ${channel} ${lead.city || ""} ${lead.interest_tag || ""}`.trim(),
      );
    } catch (e) {
      console.warn("[generate-outreach-message] fetchSystemRulesBlock failed:", e instanceof Error ? e.message : e);
    }
    const finalSystemPrompt = systemRulesBlock
      ? `${systemRulesBlock}\n\n${systemPrompt}`
      : systemPrompt;

    const leadBlock = JSON.stringify(
      {
        full_name: lead.full_name,
        city: lead.city,
        interest_tag: lead.interest_tag,
        preferences: lead.preferences,
        stage: lead.lead_stage,
      },
      null,
      2,
    );
    const listingBlock = JSON.stringify(listing, null, 2);

    const userPrompt = `LEAD:\n${leadBlock}\n\nLISTING:\n${listingBlock}\n\nAGENT NOTE: ${agent_note || "(none)"}\n\nDraft the outreach now.${systemRulesBlock ? "\nObey every rule inside #CRITICAL_SYSTEM_PREFERENCES without exception — re-write silently until your draft complies." : ""}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: finalSystemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "draft_outreach",
              description: "Return the personalized outreach draft.",
              parameters: {
                type: "object",
                properties: {
                  subject: {
                    type: "string",
                    description: "Email subject line. Empty string for whatsapp/sms.",
                  },
                  message: {
                    type: "string",
                    description: "The body of the outreach in Hebrew.",
                  },
                  highlights: {
                    type: "array",
                    items: { type: "string" },
                    description: "1–3 short bullets mapping listing features to lead needs.",
                  },
                  call_to_action: { type: "string" },
                },
                required: ["subject", "message", "highlights", "call_to_action"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "draft_outreach" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted — top up in Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const errText = await aiResp.text();
      console.error("AI gateway error", aiResp.status, errText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let draft: any = {};
    if (toolCall?.function?.arguments) {
      try {
        draft = JSON.parse(toolCall.function.arguments);
      } catch {
        draft = {};
      }
    }
    if (!draft.message) {
      draft = {
        subject: "",
        message: aiJson?.choices?.[0]?.message?.content || "",
        highlights: [],
        call_to_action: "",
      };
    }

    // Strip markdown emphasis for non-WhatsApp channels. WA Green API renders
    // *bold* natively, so we keep asterisks intact for whatsapp drafts only.
    if (channel !== "whatsapp") {
      const { stripMarkdownEmphasis } = await import("../_shared/ayrshare-helpers.ts");
      if (typeof draft.subject === "string") draft.subject = stripMarkdownEmphasis(draft.subject);
      if (typeof draft.message === "string") draft.message = stripMarkdownEmphasis(draft.message);
      if (typeof draft.call_to_action === "string") draft.call_to_action = stripMarkdownEmphasis(draft.call_to_action);
      if (Array.isArray(draft.highlights)) {
        draft.highlights = draft.highlights.map((h: unknown) => typeof h === "string" ? stripMarkdownEmphasis(h) : h);
      }
    }

    // HARD COMPLIANCE LAWS — strip street numbers from every field, append
    // license footer to the primary message body only.
    try {
      const branding = await fetchOwnerBranding(
        createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!) as any,
        userData.user.id,
      );
      if (typeof draft.subject === "string") draft.subject = stripStreetNumbers(draft.subject);
      if (typeof draft.call_to_action === "string") draft.call_to_action = stripStreetNumbers(draft.call_to_action);
      if (Array.isArray(draft.highlights)) {
        draft.highlights = draft.highlights.map((h: unknown) => typeof h === "string" ? stripStreetNumbers(h) : h);
      }
      if (typeof draft.message === "string") {
        draft.message = enforceOwnerLaws(draft.message, { license: branding.license, byline: branding.byline, withLicense: true });
      }
    } catch (_e) { /* never block on enforcement failure */ }

    // Compliance Fact-Check Layer: verify the AI didn't invent prices/titles.
    const draftBody = [draft.subject, draft.message, ...(draft.highlights || []), draft.call_to_action]
      .filter(Boolean)
      .join("\n");
    const fact_violations = factCheckDraft(String(draftBody), factListing);

    return new Response(
      JSON.stringify({
        ok: true,
        channel,
        draft,
        listing,
        lead: {
          id: lead.id,
          full_name: lead.full_name,
          phone_number: lead.phone_number,
        },
        fact_violations,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-outreach-message error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

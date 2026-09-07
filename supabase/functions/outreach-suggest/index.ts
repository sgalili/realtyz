// Outreach Engine — scans Leads for follow-up triggers and generates draft messages.
//
// Triggers implemented:
//   - post_viewing_24h: lead in 'negotiation' stage with last_interaction_at ~24h+ ago and no outbound since
//   - stale_negotiation: lead in 'negotiation' stage idle 3+ days
//   - cold_reengage: any lead idle 7+ days, not closed
//   - price_drop: a published listing on the user's account had its asking_price lowered in the last 7 days,
//                 and the lead's interest_tag matches a feature/title token of the listing
//
// Auto-Draft policy:
//   For each candidate, we check `outreach_auto_policies(user_id, tier=lead.loyalty_tier).auto_draft`.
//   When true → draft via Lovable AI Gateway. When false → store a brief templated suggestion.
//   Either way the row is inserted as `pending` for the Agent to approve in the Action Items list.
//
// Idempotency: a partial unique index on (lead_id, trigger_type) WHERE status='pending' prevents dupes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { externalMasterPrompt } from "../_shared/masterAgentPrompt.ts";
import { enforceOwnerLaws, fetchOwnerBranding } from "../_shared/owner-laws.ts";
import { fetchWorkspacePersona, renderPersonaBlock, EMPTY_PERSONA, type WorkspacePersona } from "../_shared/workspacePersona.ts";
import { fetchSystemRulesBlock } from "../_shared/system-rules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type Lead = {
  id: string;
  full_name: string | null;
  phone_number: string;
  city: string | null;
  interest_tag: string | null;
  loyalty_tier: string | null;
  lead_stage: string | null;
  last_interaction_at: string | null;
  preferences: Record<string, unknown> | null;
};

type Listing = {
  id: string;
  property_title: string;
  description: string | null;
  asking_price: number | null;
  features: unknown;
  updated_at: string;
  created_at: string;
};

type TriggerHit = {
  lead: Lead;
  trigger_type: string;
  trigger_reason: string;
  context: Record<string, unknown>;
};

const TEMPLATES: Record<string, (l: Lead, ctx: Record<string, any>) => string> = {
  post_viewing_24h: (l) =>
    `שלום ${l.full_name || ""},\nרציתי לשמוע איך הרגשת אחרי הסיור. יש שאלות שעלו? אשמח לעבור איתך על הנקודות החשובות.`,
  stale_negotiation: (l) =>
    `שלום ${l.full_name || ""},\nממשיך לחשוב עליך — האם נוכל לקבוע 10 דקות שיחה קצרה כדי להתקדם?`,
  cold_reengage: (l) =>
    `היי ${l.full_name || ""}, מקווה ששלומך טוב. ראיתי כמה הזדמנויות חדשות ${
      l.city ? `ב${l.city}` : ""
    } שיכולות להתאים לך — רוצה שאשלח?`,
  price_drop: (l, ctx) =>
    `${l.full_name || "שלום"}, עדכון חשוב: ${ctx.title} ירד במחיר ל-${
      ctx.new_price
    }₪. חשבתי שיעניין אותך — נוכל לתאם סיור?`,
};

async function draftWithAI(lead: Lead, trigger: string, ctx: Record<string, any>, systemRulesBlock = "", wsPersona: WorkspacePersona = EMPTY_PERSONA): Promise<string | null> {
  if (!LOVABLE_API_KEY) return null;
  const fallback = TEMPLATES[trigger]?.(lead, ctx) || "";
  const basePrompt = `${renderPersonaBlock(wsPersona)}\n\nאתה כותב הודעת WhatsApp קצרה, חמה ומקצועית בעברית בשם החשבון הזה (עד 3 משפטים, ללא אימוג׳ים מוגזמים).`;
  const sysPrompt = systemRulesBlock ? `${systemRulesBlock}\n\n${basePrompt}` : basePrompt;
  const userPrompt = `Lead: ${lead.full_name || "Unknown"} (${lead.city || "—"}). Stage: ${lead.lead_stage}. Tier: ${lead.loyalty_tier || "—"}. Interest: ${lead.interest_tag || "—"}.
Trigger: ${trigger}. Context: ${JSON.stringify(ctx)}.
Write a single short follow-up message in Hebrew. Do not invent prices or addresses not in the context.${systemRulesBlock ? "\nObey every rule in #CRITICAL_SYSTEM_PREFERENCES above without exception." : ""}`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: externalMasterPrompt({ surface: "outreach_suggest", owner: { name: wsPersona.name, agency: wsPersona.agency }, personaBrief: wsPersona.brief, domain: wsPersona.domain }) + "\n\n" + sysPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      console.warn("[outreach-suggest] AI gateway non-OK", res.status);
      return fallback;
    }
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content?.trim();
    return text || fallback;
  } catch (err) {
    console.error("[outreach-suggest] AI draft failed", err);
    return fallback;
  }
}

function hoursSince(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load leads (RLS will scope appropriately; we still filter is_demo)
    const { data: leadsData } = await supabase
      .from("leads")
      .select("id, full_name, phone_number, city, interest_tag, loyalty_tier, lead_stage, last_interaction_at, preferences")
      .eq("is_demo", false)
      .limit(500);
    const leads = (leadsData || []) as Lead[];

    // Load published listings for this user with possible recent price drops
    // (We use updated_at as a proxy for "price changed" since we don't have a price-history table.)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: listingsData } = await supabase
      .from("listings")
      .select("id, property_title, description, asking_price, features, updated_at, created_at")
      .eq("user_id", user.id)
      .eq("is_published", true)
      .gte("updated_at", sevenDaysAgo)
      .limit(50);
    const recentListings = (listingsData || []) as Listing[];

    // Load auto-draft policies once
    const { data: policies } = await supabase
      .from("outreach_auto_policies")
      .select("tier, auto_draft")
      .eq("user_id", user.id);
    const autoTiers = new Set(
      (policies || []).filter((p: any) => p.auto_draft).map((p: any) => p.tier)
    );

    // Build trigger hits
    const hits: TriggerHit[] = [];
    for (const lead of leads) {
      const stage = (lead.lead_stage || "").toLowerCase();
      const hrs = hoursSince(lead.last_interaction_at);

      if (stage === "negotiation" && hrs >= 24 && hrs < 72) {
        hits.push({
          lead,
          trigger_type: "post_viewing_24h",
          trigger_reason: "24+ hours since last interaction in Negotiation",
          context: { hours_idle: Math.floor(hrs) },
        });
      } else if (stage === "negotiation" && hrs >= 72) {
        hits.push({
          lead,
          trigger_type: "stale_negotiation",
          trigger_reason: "Negotiation idle for 3+ days",
          context: { hours_idle: Math.floor(hrs) },
        });
      } else if (stage !== "closed" && hrs >= 168) {
        hits.push({
          lead,
          trigger_type: "cold_reengage",
          trigger_reason: "No interaction in 7+ days",
          context: { hours_idle: Math.floor(hrs) },
        });
      }

      // Price drop matching: simple keyword match between interest_tag/city and listing title/features
      for (const lst of recentListings) {
        const tag = (lead.interest_tag || "").toLowerCase().trim();
        const city = (lead.city || "").toLowerCase().trim();
        const blob = `${lst.property_title} ${lst.description || ""} ${JSON.stringify(lst.features || [])}`.toLowerCase();
        const tokenHit =
          (tag && tag.length > 2 && blob.includes(tag)) ||
          (city && city.length > 2 && blob.includes(city));
        if (!tokenHit || !lst.asking_price) continue;
        hits.push({
          lead,
          trigger_type: "price_drop",
          trigger_reason: `Price update on "${lst.property_title}" matches interest`,
          context: {
            listing_id: lst.id,
            title: lst.property_title,
            new_price: Number(lst.asking_price).toLocaleString(),
          },
        });
      }
    }

    // Pre-fetch owner's system rules once for this batch.
    let systemRulesBlock = "";
    let wsPersona: WorkspacePersona = EMPTY_PERSONA;
    try {
      wsPersona = await fetchWorkspacePersona(supabase as any, user.id);
      systemRulesBlock = await fetchSystemRulesBlock(user.id, "follow-up outreach message");
    } catch (e) {
      console.warn("[outreach-suggest] fetchSystemRulesBlock failed:", e instanceof Error ? e.message : e);
    }

    // Insert suggestions (skip duplicates via the partial unique index)
    let inserted = 0;
    for (const hit of hits) {
      const tier = hit.lead.loyalty_tier || null;
      const autoDraft = tier ? autoTiers.has(tier) : false;
      let draft = TEMPLATES[hit.trigger_type]?.(hit.lead, hit.context) || "";
      if (autoDraft) {
        const aiDraft = await draftWithAI(hit.lead, hit.trigger_type, hit.context, systemRulesBlock, wsPersona);
        if (aiDraft) draft = aiDraft;
      }
      // HARD LAWS — strip street numbers + append broker license footer.
      try {
        const branding = await fetchOwnerBranding(supabase as any, user.id);
        draft = enforceOwnerLaws(draft, { license: branding.license, byline: branding.byline, name: branding.name, phone: branding.phone, withLicense: true });
      } catch (_e) { /* never block */ }

      const { error } = await supabase.from("outreach_suggestions").insert({
        user_id: user.id,
        lead_id: hit.lead.id,
        trigger_type: hit.trigger_type,
        trigger_reason: hit.trigger_reason,
        draft_message: draft,
        tier,
        ai_generated: true,
        metadata: { ...hit.context, auto_drafted: autoDraft },
      });
      // 23505 = unique violation → pending suggestion already exists for this trigger; skip silently
      if (!error) inserted += 1;
      else if (!(error as any)?.message?.includes("duplicate")) {
        console.warn("[outreach-suggest] insert err", error.message);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, scanned: leads.length, hits: hits.length, inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[outreach-suggest] fatal", err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

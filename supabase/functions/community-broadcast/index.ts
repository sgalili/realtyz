/**
 * Community Broadcast.
 *
 * Two modes:
 *  - mode: "preview"  -> resolves the segment, returns count + sample leads,
 *                        and (optionally) drafts ONE personalized sample so the
 *                        Agent can audit the AI tone before sending.
 *  - mode: "send"     -> drafts a personalized WhatsApp/SMS message PER lead in
 *                        the segment using the Agent's persona + recent activity,
 *                        then enqueues each into autopilot_queue. The existing
 *                        autopilot-queue-drain worker handles actual delivery.
 *
 * No raw blasts. Every message is per-lead personalized.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { loadAgentPersona, renderPersonaPrompt } from "../_shared/persona.ts";
import { adminClient, loadKbInstructions, renderKbInstructionsBlock } from "../_shared/grounding.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const MAX_RECIPIENTS_PER_SEND = 200;
const MAX_PREVIEW_SAMPLE = 8;

type Channel = "whatsapp" | "sms";
type UpdateType = "market_insight" | "new_listing" | "opportunity";

interface Segment {
  city?: string | null;
  neighborhood?: string | null;
  deal_type?: "sale" | "rent" | null;
  interest_tag?: string | null;
  lead_stage?: string | null;
  loyalty_tier?: string | null;
  min_engagement?: number | null;
  archetype?: "buyers_in_city" | "renters" | "investors" | "all" | null;
}

interface Body {
  mode: "preview" | "send";
  channel: Channel;
  update_type: UpdateType;
  /** The Agent's draft (the human-written core update). */
  draft: string;
  /** Segmenting filters. */
  segment: Segment;
  /** Hard cap from the UI; server still enforces MAX_RECIPIENTS_PER_SEND. */
  max_recipients?: number;
  /** Optional broadcast label (saved on autopilot_queue rows). */
  label?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    if (!LOVABLE_API_KEY) return json({ error: "AI gateway not configured" }, 500);

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body || !body.mode || !body.channel || !body.update_type || !body.draft?.trim()) {
      return json({ error: "mode, channel, update_type, draft are required" }, 400);
    }
    if (!["preview", "send"].includes(body.mode)) return json({ error: "Bad mode" }, 400);
    if (!["whatsapp", "sms"].includes(body.channel)) return json({ error: "Bad channel" }, 400);
    if (!["market_insight", "new_listing", "opportunity"].includes(body.update_type)) {
      return json({ error: "Bad update_type" }, 400);
    }
    if (body.draft.length > 4000) return json({ error: "Draft too long (max 4000 chars)" }, 400);

    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    // ---- Resolve segment ----
    const seg = body.segment ?? {};
    let q = supa
      .from("leads")
      .select("id, full_name, phone_number, city, neighborhood, deal_type, interest_tag, lead_stage, loyalty_tier, engagement_score, preferences, last_interaction_at")
      .eq("is_demo", false)
      .not("phone_number", "is", null);

    // Archetype shortcuts
    const arche = seg.archetype ?? "all";
    if (arche === "buyers_in_city") q = q.eq("deal_type", "sale");
    else if (arche === "renters") q = q.eq("deal_type", "rent");
    else if (arche === "investors") q = q.or("interest_tag.ilike.%investment%,interest_tag.ilike.%השקע%,lead_stage.eq.qualified");

    // Explicit filters override / refine archetype
    if (seg.deal_type) q = q.eq("deal_type", seg.deal_type);
    if (seg.city) q = q.ilike("city", `%${seg.city}%`);
    if (seg.neighborhood) q = q.ilike("neighborhood", `%${seg.neighborhood}%`);
    if (seg.interest_tag) q = q.ilike("interest_tag", `%${seg.interest_tag}%`);
    if (seg.lead_stage) q = q.eq("lead_stage", seg.lead_stage);
    if (seg.loyalty_tier) q = q.eq("loyalty_tier", seg.loyalty_tier);
    if (typeof seg.min_engagement === "number") q = q.gte("engagement_score", seg.min_engagement);

    const cap = Math.min(body.max_recipients ?? MAX_RECIPIENTS_PER_SEND, MAX_RECIPIENTS_PER_SEND);
    q = q.order("priority_score", { ascending: false }).limit(cap);

    const { data: leads, error: leadsErr } = await q;
    if (leadsErr) {
      console.error("segment query failed:", leadsErr);
      return json({ error: leadsErr.message }, 500);
    }
    const eligible = (leads ?? []).filter((l) => !!l.phone_number);

    // ---- Persona context ----
    const persona = await loadAgentPersona(SUPABASE_URL, SUPABASE_ANON, authHeader);
    const personaPrompt = renderPersonaPrompt(persona);

    // Owner-written KB learning instructions ("what to learn from this source").
    const kbInstructionsBlock = renderKbInstructionsBlock(
      await loadKbInstructions(adminClient(), userId),
    );

    // Recent activity grounding for the AI: last 5 leads the Agent worked on.
    const { data: recentActivity } = await supa
      .from("interaction_activity_log")
      .select("action_type, content, created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    const recentBlock = (recentActivity ?? [])
      .map((r: any, i: number) => `${i + 1}. [${r.action_type}] ${String(r.content ?? "").slice(0, 140)}`)
      .join("\n");

    // ---- PREVIEW mode ----
    if (body.mode === "preview") {
      const sample = eligible.slice(0, MAX_PREVIEW_SAMPLE);
      let sampleDraft: { lead_name: string | null; message: string } | null = null;
      if (sample.length > 0) {
        const text = await draftPersonalized({
          lead: sample[0],
          draft: body.draft,
          updateType: body.update_type,
          channel: body.channel,
          personaPrompt,
          recentBlock,
          kbInstructionsBlock,
        });
        sampleDraft = { lead_name: sample[0].full_name ?? null, message: text };
      }
      return json({
        ok: true,
        mode: "preview",
        recipient_count: eligible.length,
        capped_at: cap,
        sample: sample.map((l: any) => ({
          id: l.id,
          full_name: l.full_name,
          city: l.city,
          neighborhood: l.neighborhood,
          deal_type: l.deal_type,
          interest_tag: l.interest_tag,
          lead_stage: l.lead_stage,
        })),
        sample_draft: sampleDraft,
      });
    }

    // ---- SEND mode ----
    if (eligible.length === 0) {
      return json({ error: "Segment matched 0 recipients" }, 400);
    }

    const label = (body.label ?? `Broadcast • ${body.update_type} • ${new Date().toISOString().slice(0, 10)}`).slice(0, 200);
    const queuedAt = new Date().toISOString();

    // Draft per-lead in parallel batches to keep latency reasonable.
    const BATCH = 6;
    const queueRows: any[] = [];
    let drafted = 0;
    let failed = 0;

    for (let i = 0; i < eligible.length; i += BATCH) {
      const slice = eligible.slice(i, i + BATCH);
      const drafts = await Promise.all(
        slice.map(async (lead: any) => {
          try {
            const message = await draftPersonalized({
              lead,
              draft: body.draft,
              updateType: body.update_type,
              channel: body.channel,
              personaPrompt,
              recentBlock,
            });
            drafted++;
            return { lead, message };
          } catch (e) {
            console.warn("draft failed for lead", lead.id, e);
            failed++;
            return null;
          }
        }),
      );
      for (const d of drafts) {
        if (!d) continue;
        queueRows.push({
          user_id: userId,
          lead_id: d.lead.id,
          message_content: d.message,
          status: "pending",
          scheduled_at: queuedAt,
          template_id: `broadcast:${body.update_type}:${body.channel}`,
        });
      }
    }

    if (queueRows.length === 0) {
      return json({ error: "All AI drafts failed, nothing queued." }, 502);
    }

    const { error: insErr } = await supa.from("autopilot_queue").insert(queueRows);
    if (insErr) {
      console.error("autopilot_queue insert failed:", insErr);
      return json({ error: insErr.message }, 500);
    }

    // Audit log (best-effort).
    await supa.from("audit_logs").insert({
      action: "community_broadcast.send",
      actor_id: userId,
      actor_email: userData.user.email ?? null,
      target_table: "autopilot_queue",
      details: {
        label,
        channel: body.channel,
        update_type: body.update_type,
        segment: seg,
        queued: queueRows.length,
        drafted,
        failed,
      },
    }).catch(() => undefined);

    return json({
      ok: true,
      mode: "send",
      label,
      recipient_count: eligible.length,
      queued: queueRows.length,
      drafted,
      failed,
    });
  } catch (e) {
    console.error("community-broadcast error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

async function draftPersonalized(args: {
  lead: any;
  draft: string;
  updateType: UpdateType;
  channel: Channel;
  personaPrompt: string;
  recentBlock: string;
}): Promise<string> {
  const { lead, draft, updateType, channel, personaPrompt, recentBlock } = args;
  const firstName = String(lead.full_name ?? "").trim().split(/\s+/)[0] || "";
  const channelLabel = channel === "whatsapp" ? "WhatsApp" : "SMS";
  const updateLabels: Record<UpdateType, string> = {
    market_insight: "Market Insight (תובנת שוק)",
    new_listing: "New Listing (נכס חדש)",
    opportunity: "Opportunity (הזדמנות)",
  };

  const channelStyle = channel === "sms"
    ? "Channel: SMS. Hard limit: 320 characters. No links unless absolutely needed. No emojis. Plain ASCII-friendly Hebrew is fine."
    : "Channel: WhatsApp. Keep it short (under ~600 chars). Conversational, human, 1-2 short paragraphs. Max 1 emoji if it fits the Agent's style.";

  const sys = [
    personaPrompt,
    "",
    "=== COMMUNITY BROADCAST MODE ===",
    `You are drafting ONE personalised outbound ${channelLabel} message to a Lead in the Agent's CRM.`,
    `Update category: ${updateLabels[updateType]}.`,
    "Take the Agent's CORE DRAFT below and rewrite it AS THE AGENT would naturally write it to THIS specific Lead, using their name, deal_type, city/neighborhood and interests.",
    "Keep the core meaning intact, do not invent prices or addresses that are not in the draft.",
    "If recent activity is provided, you MAY reference it lightly (e.g. 'בהמשך לעבודה האחרונה שלי בשכונה') only when it strengthens credibility. Do NOT name other Leads.",
    "Open with the Lead's first name when natural. End with a soft, single CTA matching the Lead's stage.",
    channelStyle,
    "Forbidden: marketing slogans, hype emojis, dashes of any kind (em/en/double/triple), AI self-references.",
    "Neighborhood naming HARD rule: never refer to a neighborhood by a number or code (no 'שכונה 10', 'שכונה ג', 'אזור 7'). Use the Hebrew neighborhood name from the Lead context if present; otherwise omit the neighborhood entirely. Do NOT invent a name.",
    "Output ONLY the final message text, no labels, no quotes, no preamble.",
    "=== END COMMUNITY BROADCAST MODE ===",
  ].join("\n");

  const leadContext = [
    `Lead name: ${lead.full_name ?? "(unknown)"} (first name: ${firstName || "n/a"})`,
    `Phone: ${lead.phone_number}`,
    `Deal pipeline: ${lead.deal_type ?? "unknown"}`,
    `City: ${lead.city ?? "n/a"} | Neighborhood: ${lead.neighborhood ?? "n/a"}`,
    `Interest tag: ${lead.interest_tag ?? "n/a"}`,
    `Lead stage: ${lead.lead_stage ?? "n/a"} | Loyalty: ${lead.loyalty_tier ?? "n/a"} | Engagement: ${lead.engagement_score ?? 0}`,
    lead.preferences ? `Preferences (JSON): ${JSON.stringify(lead.preferences).slice(0, 400)}` : "",
  ].filter(Boolean).join("\n");

  const user = [
    "AGENT'S CORE DRAFT (the human-written update):",
    draft.trim(),
    "",
    "RECENT AGENT ACTIVITY (lightweight context, optional):",
    recentBlock || "(none)",
    "",
    "THIS LEAD'S CONTEXT:",
    leadContext,
    "",
    `Now write the personalised ${channelLabel} message.`,
  ].join("\n");

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    }),
  });
  if (!resp.ok) {
    if (resp.status === 429) throw new Error("AI rate limit, try again shortly.");
    if (resp.status === 402) throw new Error("AI credits exhausted.");
    const t = await resp.text();
    throw new Error(`AI gateway error ${resp.status}: ${t.slice(0, 200)}`);
  }
  const json = await resp.json();
  const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("AI returned empty draft");
  // Hard SMS cap.
  if (channel === "sms" && text.length > 320) return text.slice(0, 318) + "…";
  return text;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

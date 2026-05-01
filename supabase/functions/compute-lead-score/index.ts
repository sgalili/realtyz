// Predictive Prospect Score
//
// Computes a 0-100 priority score for a single lead based on:
//   1. Interaction frequency  (last 14 days)        — up to 30 pts
//   2. Sentiment              (recent inbound msgs) — up to 25 pts
//   3. Response speed         (avg minutes prospect → reply) — up to 25 pts
//   4. Property interest      (mentions of listings / price / "house" / "apartment") — up to 20 pts
//
// On a significant upward spike (>= +20 and crosses 70) we fire a "Hot Lead"
// notification to the lead's owning agent via the existing notify-agent function.
//
// Invoked by:
//   - Postgres trigger on `messages` insert (server-to-server, service role)
//   - Manual recompute from the UI (`?lead_id=...` or `{lead_id, recompute_all:true}`)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type ScoreComponents = {
  frequency: number;
  sentiment: number;
  response_speed: number;
  property_interest: number;
};

type Message = {
  id: string;
  lead_id: string;
  direction: string | null;
  sender_type: string | null;
  content: string | null;
  created_at: string;
};

const POSITIVE_WORDS = [
  "yes", "great", "perfect", "love", "interested", "amazing", "thanks",
  "thank", "sure", "definitely", "absolutely", "awesome", "excellent",
  "כן", "מעולה", "מצוין", "תודה", "מעוניין", "אוהב", "בטוח", "מושלם",
];
const NEGATIVE_WORDS = [
  "no", "not", "stop", "unsubscribe", "expensive", "annoying", "later",
  "busy", "leave", "spam", "remove",
  "לא", "יקר", "מעצבן", "אחר כך", "תפסיק", "תסיר",
];
const PROPERTY_KEYWORDS = [
  "apartment", "house", "property", "listing", "price", "bedroom",
  "viewing", "tour", "balcony", "neighborhood", "rent", "buy", "mortgage",
  "דירה", "בית", "נכס", "מחיר", "חדר", "חדרים", "סיור", "ביקור", "שכונה", "מרפסת",
];

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function countMatches(text: string, words: string[]): number {
  const lower = text.toLowerCase();
  let n = 0;
  for (const w of words) if (lower.includes(w)) n++;
  return n;
}

function isInbound(m: Message): boolean {
  const d = (m.direction || "").toLowerCase();
  const s = (m.sender_type || "").toLowerCase();
  if (d === "inbound" || d === "in" || d === "received") return true;
  if (s === "prospect" || s === "lead" || s === "user" || s === "voter") return true;
  return false;
}

function computeScore(messages: Message[]): { score: number; components: ScoreComponents } {
  const now = Date.now();
  const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
  const recent = messages.filter((m) => new Date(m.created_at).getTime() >= fourteenDaysAgo);

  // 1. Interaction frequency — up to 30 pts (10 messages = full)
  const frequency = clamp(Math.round((recent.length / 10) * 30), 0, 30);

  // 2. Sentiment — up to 25 pts. Look at last 8 inbound messages.
  const inbound = recent.filter(isInbound).slice(-8);
  let pos = 0, neg = 0;
  for (const m of inbound) {
    const t = m.content || "";
    pos += countMatches(t, POSITIVE_WORDS);
    neg += countMatches(t, NEGATIVE_WORDS);
  }
  const sentRaw = pos - neg; // can be negative
  // Map -5..+5 → 0..25, centered at 12
  const sentiment = clamp(Math.round(12 + sentRaw * 2.6), 0, 25);

  // 3. Response speed — up to 25 pts. Avg time prospect takes to reply to outbound.
  const sorted = [...recent].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const replyDeltas: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (!isInbound(prev) && isInbound(cur)) {
      const dtMin = (new Date(cur.created_at).getTime() - new Date(prev.created_at).getTime()) / 60000;
      if (dtMin >= 0 && dtMin < 60 * 24 * 3) replyDeltas.push(dtMin);
    }
  }
  let responseSpeed = 0;
  if (replyDeltas.length > 0) {
    const avg = replyDeltas.reduce((a, b) => a + b, 0) / replyDeltas.length;
    // <5 min = 25, 5-30 = 20, 30-120 = 14, 2-12h = 8, >12h = 3
    if (avg < 5) responseSpeed = 25;
    else if (avg < 30) responseSpeed = 20;
    else if (avg < 120) responseSpeed = 14;
    else if (avg < 720) responseSpeed = 8;
    else responseSpeed = 3;
  }

  // 4. Property interest — up to 20 pts. Count keyword hits in inbound msgs.
  let propHits = 0;
  for (const m of inbound) propHits += countMatches(m.content || "", PROPERTY_KEYWORDS);
  const property_interest = clamp(Math.round((propHits / 4) * 20), 0, 20);

  const components: ScoreComponents = {
    frequency,
    sentiment,
    response_speed: responseSpeed,
    property_interest,
  };
  const score = clamp(frequency + sentiment + responseSpeed + property_interest, 0, 100);
  return { score, components };
}

async function scoreOneLead(admin: any, leadId: string): Promise<{
  score: number;
  components: ScoreComponents;
  previous: number;
  spiked: boolean;
} | null> {
  const { data: lead, error: leadErr } = await admin
    .from("leads")
    .select("id, full_name, priority_score")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr || !lead) return null;

  const { data: msgs, error: msgErr } = await admin
    .from("messages")
    .select("id, lead_id, direction, sender_type, content, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (msgErr) return null;

  const { score, components } = computeScore((msgs || []) as Message[]);
  const previous = lead.priority_score ?? 0;

  await admin
    .from("leads")
    .update({
      priority_score: score,
      priority_score_components: components,
      priority_score_updated_at: new Date().toISOString(),
      previous_priority_score: previous,
    })
    .eq("id", leadId);

  // Spike detection — only fire once per crossing into hot territory.
  const spiked = score >= 70 && score - previous >= 20 && previous < 70;

  if (spiked) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/notify-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: ANON_KEY,
        },
        body: JSON.stringify({
          event_type: "new_high_priority",
          lead_id: leadId,
          prospect_name: lead.full_name,
          detail: `Priority score jumped from ${previous} to ${score}. Strong engagement detected.`,
        }),
      });
    } catch (err) {
      console.error("notify-agent dispatch failed", err);
    }
  }

  return { score, components, previous, spiked };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const leadId = body.lead_id || url.searchParams.get("lead_id");
    const recomputeAll = body.recompute_all === true;

    if (recomputeAll) {
      const { data: leads } = await admin
        .from("leads")
        .select("id")
        .eq("is_demo", false)
        .limit(500);
      let processed = 0;
      for (const l of (leads || [])) {
        await scoreOneLead(admin, l.id);
        processed++;
      }
      return new Response(JSON.stringify({ ok: true, processed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!leadId || typeof leadId !== "string") {
      return new Response(JSON.stringify({ error: "lead_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await scoreOneLead(admin, leadId);
    if (!result) {
      return new Response(JSON.stringify({ error: "lead not found or scoring failed" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("compute-prospect-score error", err);
    return new Response(JSON.stringify({ error: err?.message || "server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

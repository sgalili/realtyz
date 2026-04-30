// Given a lead_id, build a query string from leads.preferences (jsonb),
// embed it via the Lovable AI Gateway, and call match_listings_to_lead RPC.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "google/text-embedding-004", input: text }),
  });
  if (!res.ok) throw new Error(`Embedding API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json?.data?.[0]?.embedding;
}

function buildPreferenceText(prefs: any, lead: any): string {
  if (!prefs || typeof prefs !== "object") {
    return [
      `Lead: ${lead?.full_name ?? ""}`,
      `City: ${lead?.city ?? ""}`,
      `Notes: ${lead?.notes ?? ""}`,
    ].join("\n");
  }
  const lines: string[] = [];
  for (const [k, v] of Object.entries(prefs)) {
    lines.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  if (lead?.city) lines.push(`Preferred area: ${lead.city}`);
  if (lead?.notes) lines.push(`Notes: ${lead.notes}`);
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lead_id, match_count } = await req.json();
    if (!lead_id) throw new Error("lead_id is required");

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: lead, error: leadErr } = await sb
      .from("leads")
      .select("id, full_name, city, notes, preferences")
      .eq("id", lead_id)
      .maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) throw new Error("Lead not found");

    const text = buildPreferenceText(lead.preferences, lead);
    const vec = await embed(text);

    const { data: matches, error: matchErr } = await sb.rpc("match_listings_to_lead", {
      p_lead_id: lead_id,
      p_query_embedding: vec as any,
      p_match_count: Math.min(Number(match_count) || 5, 20),
    });
    if (matchErr) throw matchErr;

    return new Response(JSON.stringify({ lead_id, query_text: text, matches: matches ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("match-listings error", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

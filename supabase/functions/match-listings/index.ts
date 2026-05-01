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

function normalizeArea(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[״"׳'`.,\-_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true if the listing falls inside at least one of the agent's
 * configured service areas. Match is substring-based against city,
 * neighborhood, address, property_title, description, and any features
 * fields, so "הרצליה - מרכז" matches "הרצליה" in city + "מרכז" in title.
 */
function listingInServiceAreas(listing: any, areas: string[]): boolean {
  if (!areas?.length) return true; // no zones configured -> don't filter
  const haystack = normalizeArea([
    listing?.city,
    listing?.neighborhood,
    listing?.address,
    listing?.property_title,
    listing?.description,
    typeof listing?.features === "string"
      ? listing.features
      : JSON.stringify(listing?.features ?? {}),
  ].filter(Boolean).join(" "));
  return areas.some((zone) => {
    const tokens = normalizeArea(zone).split(" ").filter((t) => t.length >= 2);
    if (!tokens.length) return false;
    // Require that the PRIMARY token (city) appears. Extra tokens (neighborhood)
    // are bonus, but city alone is enough to keep the listing.
    const city = tokens[0];
    return haystack.includes(city);
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lead_id, match_count } = await req.json();
    if (!lead_id) throw new Error("lead_id is required");

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: lead, error: leadErr } = await sb
      .from("leads")
      .select("id, full_name, city, notes, preferences, user_id")
      .eq("id", lead_id)
      .maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) throw new Error("Lead not found");

    // Hyper-local filter: load the owning Agent's service_areas so we can
    // strip out-of-zone listings before returning them to the AI / UI.
    let serviceAreas: string[] = [];
    if (lead.user_id) {
      const { data: profile } = await sb
        .from("profiles")
        .select("service_areas")
        .eq("id", lead.user_id)
        .maybeSingle();
      if (Array.isArray((profile as any)?.service_areas)) {
        serviceAreas = ((profile as any).service_areas as string[]).filter(Boolean);
      }
    }

    const text = buildPreferenceText(lead.preferences, lead);
    const vec = await embed(text);

    const requested = Math.min(Number(match_count) || 5, 20);
    // Over-fetch so post-filtering still returns enough in-zone matches.
    const fetchCount = serviceAreas.length ? Math.min(requested * 4, 50) : requested;

    const { data: matches, error: matchErr } = await sb.rpc("match_listings_to_lead", {
      p_lead_id: lead_id,
      p_query_embedding: vec as any,
      p_match_count: fetchCount,
    });
    if (matchErr) throw matchErr;

    const all = (matches ?? []) as any[];
    const inZone = serviceAreas.length
      ? all.filter((m) => listingInServiceAreas(m, serviceAreas))
      : all;
    const filteredOut = all.length - inZone.length;
    const trimmed = inZone.slice(0, requested);

    return new Response(JSON.stringify({
      lead_id,
      query_text: text,
      service_areas: serviceAreas,
      filtered_out_of_zone: filteredOut,
      matches: trimmed,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("match-listings error", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

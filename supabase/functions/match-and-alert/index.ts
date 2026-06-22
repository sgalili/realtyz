// Match a lead's preferences against listings and, if a hot match is found,
// insert a row in deal_room_matches. The DB trigger fires the broker alert.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Prefs = {
  rooms?: number;
  budget_min?: number;
  budget_max?: number;
  city?: string;
  neighborhood?: string;
  deal_type?: "sale" | "rent";
};

function score(listing: any, p: Prefs): { score: number; reasons: string[] } {
  let s = 0;
  const reasons: string[] = [];

  if (p.city && listing.city && listing.city.includes(p.city)) {
    s += 30; reasons.push(`עיר: ${listing.city}`);
  }
  if (p.neighborhood && listing.neighborhood && listing.neighborhood.includes(p.neighborhood)) {
    s += 20; reasons.push(`שכונה: ${listing.neighborhood}`);
  }
  if (p.rooms && listing.rooms != null) {
    const diff = Math.abs(Number(listing.rooms) - Number(p.rooms));
    if (diff <= 0.5) { s += 25; reasons.push(`${listing.rooms} חדרים`); }
    else if (diff <= 1) { s += 12; }
  }
  const price = Number(listing.asking_price ?? 0);
  if (price > 0) {
    const min = p.budget_min ?? 0;
    const max = p.budget_max ?? Infinity;
    if (price >= min && price <= max) { s += 25; reasons.push(`בתקציב`); }
    else if (max !== Infinity && price <= max * 1.1) { s += 10; }
  }
  return { score: s, reasons };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { lead_id, threshold = 60 } = await req.json().catch(() => ({}));
    if (!lead_id) return json(400, { error: "lead_id required" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: lead, error: lerr } = await admin
      .from("leads")
      .select("id,assigned_to,full_name,city,neighborhood,deal_type,preferences,interest_tag")
      .eq("id", lead_id)
      .maybeSingle();
    if (lerr || !lead) return json(404, { error: "lead not found" });

    const prefs: Prefs = {
      ...(lead.preferences as any || {}),
      city: (lead.preferences as any)?.city || lead.city || undefined,
      neighborhood: (lead.preferences as any)?.neighborhood || lead.neighborhood || undefined,
      deal_type: ((lead.preferences as any)?.deal_type || lead.deal_type) as any,
    };

    // Pull active listings in same workspace (assigned_to)
    const { data: listings } = await admin
      .from("listings")
      .select("id,user_id,property_title,city,neighborhood,rooms,asking_price")
      .eq("user_id", lead.assigned_to)
      .in("status", ["live", "pending"])
      .limit(200);

    let best: { listing: any; score: number; reasons: string[] } | null = null;
    for (const l of listings || []) {
      const r = score(l, prefs);
      if (!best || r.score > best.score) best = { listing: l, score: r.score, reasons: r.reasons };
    }

    if (!best || best.score < threshold) {
      return json(200, { matched: false, best_score: best?.score ?? 0 });
    }

    const brokerId = best.listing.user_id || lead.assigned_to;
    const { data: match, error: ierr } = await admin
      .from("deal_room_matches")
      .upsert(
        {
          lead_id,
          listing_id: best.listing.id,
          broker_id: brokerId,
          match_score: best.score,
          match_reasons: best.reasons,
          status: "new",
        },
        { onConflict: "lead_id,listing_id", ignoreDuplicates: false },
      )
      .select()
      .maybeSingle();
    if (ierr) return json(500, { error: ierr.message });

    return json(200, { matched: true, match, score: best.score, reasons: best.reasons });
  } catch (e) {
    return json(500, { error: String(e?.message ?? e) });
  }
});

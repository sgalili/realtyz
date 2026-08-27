// Public read endpoint for a property share token. Returns a small, curated
// payload so the shared page can render workspace label + property card +
// broker WhatsApp button — with zero auth. Increments views_count as a side
// effect so brokers see engagement in the CRM.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || (await req.json().catch(() => ({})))?.token;
    if (!token) {
      return new Response(JSON.stringify({ error: "missing token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: share, error } = await admin
      .from("property_shares")
      .select("id, owner_id, listing_id, external_snapshot, workspace_name, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (error || !share) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "expired" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let property: any = null;
    if (share.listing_id) {
      const { data: l } = await admin
        .from("listings")
        .select("id, owner_id, property_title, description, short_description, long_description, asking_price, city, address, neighborhood, rooms, sqm, floor, parking, elevator, media_photos, deal_type, features, attributes, furniture_details, additional_details, source_metadata, area_perks, price_history, latitude, longitude, project_name")
        .eq("id", share.listing_id)
        .maybeSingle();
      if (l) property = l;
    }
    if (!property && share.external_snapshot) property = share.external_snapshot;

    // Workspace branding (logo + name) for the public header.
    let logo_url: string | null = null;
    let agency_name: string | null = null;
    let workspace_name = share.workspace_name as string | null;
    if (share.owner_id) {
      const { data: wl } = await admin
        .from("white_label_settings")
        .select("agency_name, logo_url, landscape_logo_url")
        .eq("user_id", share.owner_id)
        .maybeSingle();
      if (wl) {
        logo_url = wl.logo_url || wl.landscape_logo_url || null;
        // The public header must show the brokerage brand, not the agent name.
        agency_name = wl.agency_name || null;
        workspace_name = wl.agency_name || workspace_name || null;
      }
    }

    // HARD RULE: the public page never receives a personal / broker WhatsApp
    // number. The CTA always targets our official Meta WBA number, so only the
    // owner's display name is exposed here.
    let owner_name: string | null = null;
    if (property?.owner_id) {
      const { data: owner } = await admin
        .from("crm_profiles")
        .select("full_name")
        .eq("id", property.owner_id)
        .maybeSingle();
      owner_name = owner?.full_name ?? null;
    }

    // Neighborhood market data (computed with service role so the public page
    // never needs listings read access).
    let area_facts: Record<string, unknown> | null = null;
    if (property?.city) {
      const dealType = String(property.deal_type ?? "").toLowerCase() === "rent"
        || (Number(property.asking_price) > 0 && Number(property.asking_price) < 50_000)
        ? "rent" : "sale";
      const { data: comps } = await admin
        .from("listings")
        .select("asking_price, sqm, rooms, deal_type")
        .eq("city", property.city)
        .limit(400);
      const rows = (comps ?? []).filter((r: any) => {
        const p = Number(r.asking_price) || 0;
        if (p <= 0) return false;
        const t = String(r.deal_type ?? "").toLowerCase() === "rent" || p < 50_000 ? "rent" : "sale";
        return t === dealType;
      });
      if (rows.length >= 3) {
        const prices = rows.map((r: any) => Number(r.asking_price));
        const perSqm = rows.filter((r: any) => Number(r.sqm) > 0)
          .map((r: any) => Number(r.asking_price) / Number(r.sqm));
        const roomsArr = rows.filter((r: any) => Number(r.rooms) > 0).map((r: any) => Number(r.rooms));
        const sqmArr = rows.filter((r: any) => Number(r.sqm) > 0).map((r: any) => Number(r.sqm));
        const mean = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
        const sorted = [...prices].sort((a, b) => a - b);
        area_facts = {
          city: property.city,
          neighborhood: property.neighborhood ?? null,
          dealType,
          sampleSize: rows.length,
          avgPrice: mean(prices),
          medianPrice: sorted.length % 2
            ? sorted[(sorted.length - 1) / 2]
            : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2),
          avgPricePerSqm: mean(perSqm),
          avgRooms: roomsArr.length ? Math.round(mean(roomsArr.map((r) => r * 10))! / 10 * 10) / 10 : null,
          avgSqm: mean(sqmArr),
        };
      }
    }

    // Fire-and-forget view counter — never blocks response.
    admin.from("property_shares").update({ views_count: (undefined as any) })
      .eq("id", share.id).then(() => {}, () => {});
    admin.rpc("increment_property_share_views", { p_id: share.id }).then(
      () => {},
      async () => {
        // Fallback: raw update if RPC missing
        await admin.from("property_shares")
          .update({ views_count: (share as any).views_count ? (share as any).views_count + 1 : 1 } as any)
          .eq("id", share.id);
      },
    );

    return new Response(JSON.stringify({
      workspace_name,
      agency_name,
      logo_url,
      area_facts,
      owner_name,
      broker_wa: null,
      property,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

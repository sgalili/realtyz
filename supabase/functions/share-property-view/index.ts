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
      .select("id, owner_id, listing_id, external_snapshot, workspace_name, broker_wa, expires_at")
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
        .select("id, owner_id, property_title, description, asking_price, city, address, neighborhood, rooms, sqm, floor, media_photos, deal_type, features")
        .eq("id", share.listing_id)
        .maybeSingle();
      if (l) property = l;
    }
    if (!property && share.external_snapshot) property = share.external_snapshot;

    // Workspace branding (logo + name) for the public header.
    let logo_url: string | null = null;
    let workspace_name = share.workspace_name as string | null;
    if (share.owner_id) {
      const { data: wl } = await admin
        .from("white_label_settings")
        .select("agency_name, logo_url, landscape_logo_url")
        .eq("user_id", share.owner_id)
        .maybeSingle();
      if (wl) {
        logo_url = wl.logo_url || wl.landscape_logo_url || null;
        workspace_name = workspace_name || wl.agency_name || null;
      }
    }

    // Prefer the property owner's mobile for the WhatsApp CTA, fall back to broker.
    let owner_wa: string | null = null;
    let owner_name: string | null = null;
    if (property?.owner_id) {
      const { data: owner } = await admin
        .from("crm_profiles")
        .select("full_name, phone")
        .eq("id", property.owner_id)
        .maybeSingle();
      if (owner?.phone) {
        owner_wa = owner.phone;
        owner_name = owner.full_name ?? null;
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
      logo_url,
      owner_wa,
      owner_name,
      broker_wa: share.broker_wa,
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

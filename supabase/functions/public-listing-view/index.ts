import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { cleanPayload } from "../_shared/cleanValues.ts";
import { maskAddress, maskContactText } from "../_shared/publicMask.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const identifier = (url.searchParams.get("id") ?? "").trim();
    if (!identifier || identifier.length > 160) {
      return new Response(JSON.stringify({ error: "invalid identifier" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const backendUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!backendUrl || !serviceKey) throw new Error("missing backend configuration");
    const admin = createClient(backendUrl, serviceKey);
    const columns = "id, slug, property_title, address, neighborhood, city, deal_type, rooms, sqm, floor, asking_price, description, short_description, long_description, features, attributes, additional_details, furniture_details, area_perks, available_from, elevator, parking, project_name, latitude, longitude, image_url, media_photos, price_history, contact_options, is_published, status, affiliate_enabled, workspace_owner_id, user_id";

    let query = admin.from("listings").select(columns).limit(1);
    query = UUID_RE.test(identifier) ? query.eq("id", identifier) : query.eq("slug", identifier);
    const { data: listing, error } = await query.maybeSingle();
    if (error) throw error;
    // Affiliate links remain usable from the persisted database snapshot even
    // after the source ad expires or the local status changes.
    const publishable = listing && (listing.is_published === true || listing.affiliate_enabled === true);
    if (!publishable) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ownerId = listing.workspace_owner_id ?? listing.user_id;
    const [{ data: profile }, { data: brand }, { data: workspace }] = await Promise.all([
      admin.from("profiles").select("full_name, broker_byline, broker_license_number").eq("id", ownerId).maybeSingle(),
      admin.from("white_label_settings").select("agency_name, logo_url, landscape_logo_url").eq("user_id", ownerId).maybeSingle(),
      admin.from("workspace_memberships").select("workspace_name, workspace_logo_url").eq("workspace_owner_id", ownerId).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    ]);

    const { data: workspaceRows } = await admin
      .from("listings")
      .select(columns)
      .eq("workspace_owner_id", ownerId)
      .eq("affiliate_enabled", true)
      .eq("status", "live")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(100);

    const publicProperty = (row: Record<string, any>) => {
      const {
        workspace_owner_id: _workspaceOwnerId,
        user_id: _userId,
        is_published: _isPublished,
        affiliate_enabled: _affiliateEnabled,
        ...safe
      } = row;
      safe.address = maskAddress(safe.address);
      safe.property_title = maskAddress(safe.property_title);
      safe.description = maskContactText(maskAddress(safe.description));
      safe.short_description = maskContactText(maskAddress(safe.short_description));
      safe.long_description = maskContactText(maskAddress(safe.long_description));
      return cleanPayload(safe);
    };
    // Only clean, readable values leave the backend: identifiers, hashes and
    // debug keys from the ingestion pipeline are stripped here.
    const property = publicProperty(listing);
    const workspace_properties = (workspaceRows ?? []).map((row) => publicProperty(row));
    return new Response(JSON.stringify({
      property,
      workspace_properties,
      attribution: {
        broker_name: profile?.broker_byline || profile?.full_name || "שם המתווך לא צוין",
        office_name: brand?.agency_name || workspace?.workspace_name || "שם המשרד לא צוין",
        broker_license_number: profile?.broker_license_number || null,
        agency_logo_url: brand?.landscape_logo_url || brand?.logo_url || workspace?.workspace_logo_url || null,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[public-listing-view]", error);
    return new Response(JSON.stringify({ error: "listing lookup failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
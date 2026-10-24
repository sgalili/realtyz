import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { cleanPayload } from "../_shared/cleanValues.ts";
import { maskContactText, toPublicCard } from "../_shared/publicMask.ts";
import { verifiedSourceLicense, licenseNumber } from "../_shared/yad2Publisher.ts";
import { publicDeveloperDetails } from '../_shared/publicDeveloperDetails.ts';
import { publicPricing } from '../_shared/publicListingVisibility.ts';

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
    let signedIn = false;
    let viewerId: string | null = null;
    let closingAllowed = false;
    const authorization = req.headers.get('authorization');
    if (authorization?.startsWith('Bearer ')) {
      const { data: identity } = await admin.auth.getUser(authorization.slice(7));
      if (identity.user) {
        signedIn = true;
        viewerId = identity.user.id;
        const { data: allowed, error: accessError } = await admin.rpc('partner_can_view_closing', { _user_id: identity.user.id });
        closingAllowed = !accessError && allowed === true;
      }
    }
    const columns = "id, slug, property_title, address, house_number, apartment_number, neighborhood, city, deal_type, rooms, sqm, floor, asking_price, description, short_description, long_description, features, attributes, additional_details, furniture_details, area_perks, available_from, elevator, parking, project_name, latitude, longitude, image_url, media_photos, price_history, daily_lead_cap, contact_options, affiliate_tier1_amount, affiliate_tier2_amount, affiliate_tier3_amount, affiliate_tier4_amount, affiliate_tier4_type, is_published, status, affiliate_enabled, workspace_owner_id, user_id, source, source_metadata, owner_id, developer_project_id, developer_unit_key";

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
    // Only this authenticated partner's commitment may override current offers.
    const { data: snapshot } = viewerId
      ? await admin.from('listing_reward_snapshots').select('tier1_amount,tier2_amount,tier3_amount,tier4_amount,tier4_type,asking_price,terms')
        .eq('listing_id', listing.id).eq('affiliate_id', viewerId).eq('workspace_owner_id', ownerId).maybeSingle()
      : { data: null };
    // Hierarchy is built solely from explicitly published listing snapshots,
    // never from private company/project rows or unpublished units.
    const projectRows: Record<string, any>[] = [];
    if (listing.developer_project_id && listing.developer_unit_key === 'project') {
      for (let from = 0; ; from += 200) {
        const { data: units, error: unitError } = await admin.from('listings').select(columns)
          .eq('workspace_owner_id', ownerId).eq('developer_project_id', listing.developer_project_id)
          .eq('is_published', true).eq('status', 'live').neq('developer_unit_key', 'project')
          .order('id').range(from, from + 199);
        if (unitError) throw unitError;
        projectRows.push(...(units ?? []));
        if (!units || units.length < 200) break;
      }
    }
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
      if (snapshot && row.id === listing.id) {
        const terms = snapshot.terms as Record<string, any> | null;
        row = { ...row,
          affiliate_tier1_amount: snapshot.tier1_amount, affiliate_tier2_amount: snapshot.tier2_amount,
          affiliate_tier3_amount: snapshot.tier3_amount, affiliate_tier4_amount: snapshot.tier4_amount,
          affiliate_tier4_type: snapshot.tier4_type,
          features: { ...row.features, deal_closing_commission: terms?.deal_closing_commission ?? { type: snapshot.tier4_type, value: snapshot.tier4_amount } },
        };
      }
      const {
        workspace_owner_id: _workspaceOwnerId,
        user_id: _userId,
        is_published: _isPublished,
        affiliate_enabled: _affiliateEnabled,
        developer_project_id: _projectId,
        developer_unit_key: _unitKey,
        ...safe
      } = row;
      // Full address (street, house number, apartment) is public.
      safe.description = maskContactText(safe.description);
      safe.short_description = maskContactText(safe.short_description);
      safe.long_description = maskContactText(safe.long_description);
      if (row.developer_project_id) {
        const f = row.features ?? {};
        safe.features = { publisher_type: 'developer', property_type: f.property_type, amenity_labels: Array.isArray(f.amenity_labels) ? f.amenity_labels.map(maskContactText) : [], developer_unit_details: publicDeveloperDetails(f.developer_unit_details), specifications: publicDeveloperDetails({ specifications: f.specifications }).specifications };
      }
      const cleaned = cleanPayload(safe) as Record<string, any>;
      cleaned.contact_options = toPublicCard(row).contact_options;
      // Keep stable app identifiers for map selection and lead-gate actions.
      // They are used only as data attributes, never rendered as public text.
      if (typeof row.id === "string") cleaned.id = row.id;
      if (typeof row.slug === "string") cleaned.slug = row.slug;
      return publicPricing(cleaned, signedIn, closingAllowed);
    };
    // Only clean, readable values leave the backend: identifiers, hashes and
    // debug keys from the ingestion pipeline are stripped here.
    const property = publicProperty(listing);
    const workspace_properties = (workspaceRows ?? []).map((row) => publicProperty(row));
    const ownAttribution = {
      broker_name: profile?.broker_byline || profile?.full_name || "שם המתווך לא צוין",
      office_name: brand?.agency_name || workspace?.workspace_name || "שם המשרד לא צוין",
      broker_license_number: licenseNumber(profile?.broker_license_number),
      agency_logo_url: brand?.landscape_logo_url || brand?.logo_url || workspace?.workspace_logo_url || null,
    };
    // Imported ads (Yad2 etc.) always show the ORIGINAL advertiser, never the
    // workspace or affiliate that imported/promotes them.
    const ownerIds = [...new Set([listing, ...(workspaceRows ?? [])]
      .filter((r: any) => r.source && r.source !== "manual" && r.owner_id).map((r: any) => r.owner_id))];
    const { data: owners } = ownerIds.length
      ? await admin.from("crm_profiles").select("id, full_name").in("id", ownerIds)
      : { data: [] as any[] };
    const ownerMap = new Map((owners ?? []).map((o: any) => [o.id, o.full_name]));
    const attributionFor = (row: Record<string, any>) => {
      if (!row.source || row.source === "manual") return ownAttribution;
      const m = (row.source_metadata ?? {}) as Record<string, any>;
      const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      const name = txt(m.broker_name) ?? txt(m.contact_name) ?? txt(m.owner_name) ?? txt(ownerMap.get(row.owner_id));
      const office = txt(m.agency_name) ?? txt(m.office_name) ?? txt(m.merchant_name);
      const licence = verifiedSourceLicense(m);
      // "בלעדיות" on Yad2 means a broker/agency posted the ad, never a private owner.
      const exclusive = [row.additional_details, row.attributes].some((d: any) => d?.isAssetExclusive === true);
      const broker = exclusive || !!licence || !!office || ["broker", "agency"].includes(m.publisher_kind);
      return {
        broker_name: name ?? (broker ? "מתווך" : "בעל הנכס"),
        office_name: office ?? (broker ? "משרד תיווך" : m.publisher_kind === "private" ? "מפרסם פרטי" : null),
        broker_license_number: licence,
        agency_logo_url: txt(m.office_logo_url) ?? txt(m.agency_logo_url),
      };
    };
    for (const row of [listing, ...(workspaceRows ?? [])]) (row as any).__attr = attributionFor(row as any);
    const strip = (r: any) => { const { source_metadata: _m, owner_id: _o, __attr: _a, ...rest } = r; return rest; };
    return new Response(JSON.stringify({
      property: { ...strip(property), attribution: (listing as any).__attr },
      workspace_properties: (workspaceRows ?? []).map((r: any, i: number) => ({ ...strip(workspace_properties[i]), attribution: r.__attr })),
      attribution: (listing as any).__attr,
      project_units: projectRows.map(row => ({ ...strip(publicProperty(row)), attribution: attributionFor(row), building_name: maskContactText(row.features?.developer_unit_details?.building_name ?? '') })),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[public-listing-view]", error);
    return new Response(JSON.stringify({ error: "listing lookup failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
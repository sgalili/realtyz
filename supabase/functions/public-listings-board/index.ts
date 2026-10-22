// Public listings board — anonymous, MASKED read path.
//
// This is the only way an unauthenticated visitor can see listings: the
// direct anon SELECT policy on `listings` was removed on purpose, so exact
// street numbers and owner/broker phone numbers can never leak and the
// platform cannot be bypassed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { PUBLIC_CARD_COLUMNS, toPublicCard } from "../_shared/publicMask.ts";
import { isFeedEligible } from '../_shared/publicListingVisibility.ts';
import { verifiedSourceLicense } from '../_shared/yad2Publisher.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const backendUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!backendUrl || !serviceKey) throw new Error("missing backend configuration");
    const admin = createClient(backendUrl, serviceKey);

    const num = (key: string): number | null => {
      const raw = url.searchParams.get(key);
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };
    const text = (key: string): string | null => {
      const raw = (url.searchParams.get(key) ?? "").trim();
      return raw && raw.length <= 80 ? raw : null;
    };

    const limit = Math.min(Math.max(num("limit") ?? 24, 1), 60);
    const offset = Math.max(num("offset") ?? 0, 0);

    let query = admin
      .from("listings")
      .select(`${PUBLIC_CARD_COLUMNS},source,source_metadata,workspace_owner_id,user_id,owner_id`)
      .or("is_published.eq.true,affiliate_enabled.eq.true")
      .neq("status", "discarded")
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const city = text("city");
    if (city) query = query.ilike("city", `%${city}%`);
    const dealType = text("deal_type");
    if (dealType === "sale" || dealType === "rent") query = query.eq("deal_type", dealType);
    const minRooms = num("min_rooms");
    if (minRooms) query = query.gte("rooms", minRooms);
    const maxPrice = num("max_price");
    if (maxPrice) query = query.lte("asking_price", maxPrice);
    const minPrice = num("min_price");
    if (minPrice) query = query.gte("asking_price", minPrice);

    const search = text("q");
    if (search) {
      query = query.or(
        `city.ilike.%${search}%,neighborhood.ilike.%${search}%,property_title.ilike.%${search}%`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    // Properties that already hit their daily lead limit stop being promoted.
    const rows = (data ?? []) as any[];
    const ownerIds = [...new Set(rows.map(row => row.workspace_owner_id ?? row.user_id).filter(Boolean))];
    const sourceOwners = [...new Set(rows.map(row => row.owner_id).filter(Boolean))];
    const [profiles, brands, owners] = await Promise.all([
      ownerIds.length ? admin.from('profiles').select('id,full_name,broker_byline').in('id', ownerIds) : Promise.resolve({ data: [] }),
      ownerIds.length ? admin.from('white_label_settings').select('user_id,agency_name,logo_url,landscape_logo_url').in('user_id', ownerIds) : Promise.resolve({ data: [] }),
      sourceOwners.length ? admin.from('crm_profiles').select('id,full_name').in('id', sourceOwners) : Promise.resolve({ data: [] }),
    ]);
    const attribution = (row: any) => {
      const profile = profiles.data?.find(item => item.id === (row.workspace_owner_id ?? row.user_id));
      const brand = brands.data?.find(item => item.user_id === (row.workspace_owner_id ?? row.user_id));
      const metadata = row.source_metadata ?? {};
      const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
      if (row.source && row.source !== 'manual') {
        const office = text(metadata.agency_name) ?? text(metadata.office_name) ?? text(metadata.merchant_name);
        const license = verifiedSourceLicense(metadata);
        const broker = !!office || !!license || ['broker', 'agency'].includes(metadata.publisher_kind);
        return {
          broker_name: text(metadata.broker_name) ?? text(metadata.contact_name) ?? text(metadata.owner_name) ?? text(owners.data?.find(item => item.id === row.owner_id)?.full_name) ?? (broker ? 'מתווך' : 'בעל הנכס'),
          office_name: office,
          agency_logo_url: text(metadata.office_logo_url) ?? text(metadata.agency_logo_url),
          broker_license_number: license,
          publisher_kind: broker ? 'broker' : 'private',
        };
      }
      return { broker_name: profile?.broker_byline || profile?.full_name || 'מפרסם המודעה', office_name: brand?.agency_name ?? null, agency_logo_url: brand?.landscape_logo_url || brand?.logo_url || null, publisher_kind: row.source_metadata?.publisher_kind ?? null };
    };
    const capped = new Set<string>();
    await Promise.all(rows.filter((r) => r.contact_options?.lead_daily_limits || r.daily_lead_cap).map(async (r) => {
      const { data: reached } = await admin.rpc("listing_daily_cap_reached", { _listing_id: r.id });
      if (reached === true) capped.add(r.id);
    }));
    return json({ properties: rows.filter((r) => isFeedEligible(r) && !capped.has(r.id)).map((row) => ({ ...toPublicCard(row), affiliate_enabled: row.affiliate_enabled === true, attribution: attribution(row) })), has_more: rows.length === limit });
  } catch (error) {
    console.error("[public-listings-board]", error);
    return json({ error: "board lookup failed" }, 500);
  }
});

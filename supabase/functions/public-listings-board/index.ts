// Public listings board — anonymous, MASKED read path.
//
// This is the only way an unauthenticated visitor can see listings: the
// direct anon SELECT policy on `listings` was removed on purpose, so exact
// street numbers and owner/broker phone numbers can never leak and the
// platform cannot be bypassed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { PUBLIC_CARD_COLUMNS, toPublicCard } from "../_shared/publicMask.ts";
import { isFeedEligible, audienceCanSeeListing, meetsBoardRules, boardPublisherName, publisherDisplayKind, closingRewardLevel, privatePublisherAvatar } from '../_shared/publicListingVisibility.ts';
import { verifiedSourceLicense } from '../_shared/yad2Publisher.ts';
import { publicPricing } from '../_shared/publicListingVisibility.ts';
import { boardFilterFacts } from '../_shared/boardFilterFacts.ts';
import { advertiserText, affiliatedOffice } from '../_shared/advertiserIdentity.ts';

// Coarse 0-3 lead price level matching the publisher sliders; reveals no amount.
const LEAD_RANGES = { form: [40, 150], whatsapp: [50, 200], phone: [80, 250] } as const;
const leadLevel = (key: keyof typeof LEAD_RANGES, value: unknown) => { const v = Number(value); if (!(v > 0)) return null; const [min, max] = LEAD_RANGES[key]; return Math.min(3, Math.floor((Math.min(max, Math.max(min, v)) - min) / (max - min) * 4)); };
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
    let signedIn = false;
    let closingAllowed = false;
    const authorization = req.headers.get('authorization');
    if (authorization?.startsWith('Bearer ')) {
      const { data: identity } = await admin.auth.getUser(authorization.slice(7));
      if (identity.user) {
        signedIn = true;
        const viewer = createClient(backendUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? serviceKey, {
          global: { headers: { Authorization: authorization } },
        });
        const { data: allowed, error: accessError } = await viewer.rpc('can_view_closing_prices');
        closingAllowed = !accessError && allowed === true;
      }
    }

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
      .select(`${PUBLIC_CARD_COLUMNS},affiliate_tier4_type,source,source_metadata,workspace_owner_id,user_id,owner_id,attributes,additional_details,available_from,elevator,parking`)
      .eq("is_published", true)
      .is('canonical_duplicate_of', null)
      .neq("status", "discarded")
      .gt("asking_price", 0)
      .or("affiliate_tier1_amount.gt.0,affiliate_tier2_amount.gt.0,affiliate_tier3_amount.gt.0,affiliate_tier4_amount.gt.0,features->deal_closing_commission->>value.gt.0")
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (!closingAllowed) query = query.or('affiliate_tier1_amount.gt.0,affiliate_tier2_amount.gt.0,affiliate_tier3_amount.gt.0');

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
    const [profiles, brands, owners, roles] = await Promise.all([
      ownerIds.length ? admin.from('profiles').select('id,full_name,broker_byline').in('id', ownerIds) : Promise.resolve({ data: [] }),
      ownerIds.length ? admin.from('white_label_settings').select('user_id,agency_name,logo_url,landscape_logo_url').in('user_id', ownerIds) : Promise.resolve({ data: [] }),
      sourceOwners.length ? admin.from('crm_profiles').select('id,full_name').in('id', sourceOwners) : Promise.resolve({ data: [] }),
      ownerIds.length ? admin.from('user_roles').select('user_id,role').in('user_id', ownerIds) : Promise.resolve({ data: [] }),
    ]);
    const { data: affiliatedBrand } = await admin.from('white_label_settings').select('agency_name,logo_url,landscape_logo_url').eq('agency_name', 'אנגלו סכסון הרצליה').order('created_at', { ascending: true }).limit(1).maybeSingle();
    const attribution = (row: any) => {
      const profile = profiles.data?.find(item => item.id === (row.workspace_owner_id ?? row.user_id));
      const brand = brands.data?.find(item => item.user_id === (row.workspace_owner_id ?? row.user_id));
      const metadata = row.source_metadata ?? {};
      const text = (value: unknown) => advertiserText(value) || null;
      if (row.source && row.source !== 'manual') {
        const office = text(metadata.agency_name) ?? text(metadata.office_name) ?? text(metadata.merchant_name);
        const license = verifiedSourceLicense(metadata);
        const broker = !!office || !!license || ['broker', 'agency'].includes(metadata.publisher_kind);
        const publisherName = text(metadata.broker_name) ?? text(metadata.contact_name) ?? text(metadata.owner_name) ?? text(owners.data?.find(item => item.id === row.owner_id)?.full_name);
        const affiliation = affiliatedOffice(publisherName, affiliatedBrand);
        return {
          broker_name: publisherName,
          office_name: office ?? affiliation?.office_name ?? null,
          agency_logo_url: affiliation?.agency_logo_url ?? text(metadata.office_logo_url) ?? text(metadata.agency_logo_url) ?? text(metadata.avatar_url) ?? (broker ? null : privatePublisherAvatar(row.owner_id ?? row.id, publisherName)),
          broker_license_number: license,
          publisher_kind: publisherDisplayKind(metadata.publisher_kind ?? (broker ? 'broker' : 'private')),
        };
      }
      const kind = publisherDisplayKind(row.features?.publisher_type ?? metadata.publisher_kind, (roles.data ?? []).filter(item => item.user_id === (row.workspace_owner_id ?? row.user_id)).map(item => item.role));
      return { broker_name: profile?.full_name || profile?.broker_byline || row.features?.contact_name || null, office_name: brand?.agency_name ?? null, agency_logo_url: brand?.landscape_logo_url || brand?.logo_url || null, publisher_kind: kind };
    };
    const capped = new Set<string>();
    await Promise.all(rows.filter((r) => r.contact_options?.lead_daily_limits || r.daily_lead_cap).map(async (r) => {
      const { data: reached } = await admin.rpc("listing_daily_cap_reached", { _listing_id: r.id });
      if (reached === true) capped.add(r.id);
    }));
    const properties = rows.filter((r) => isFeedEligible(r) && audienceCanSeeListing(r, closingAllowed) && !capped.has(r.id)).flatMap((row) => {
      const base = attribution(row);
      const name = boardPublisherName(base.broker_name, base.publisher_kind);
      if (!meetsBoardRules(row, name)) return [];
      const pricing = publicPricing({
        affiliate_tier1_amount: row.affiliate_tier1_amount, affiliate_tier2_amount: row.affiliate_tier2_amount,
        affiliate_tier3_amount: row.affiliate_tier3_amount, affiliate_tier4_amount: row.affiliate_tier4_amount,
        affiliate_tier4_type: row.affiliate_tier4_type, features: { deal_closing_commission: row.features?.deal_closing_commission },
        asking_price: row.asking_price, deal_type: row.deal_type,
      }, signedIn, closingAllowed);
      const { features: _features, asking_price: _price, deal_type: _deal, ...rewardFacts } = pricing;
      return [{ ...toPublicCard(row), ...boardFilterFacts(row), ...rewardFacts, affiliate_enabled: row.affiliate_enabled === true, reward_levels: { form: leadLevel('form', row.affiliate_tier1_amount), whatsapp: leadLevel('whatsapp', row.affiliate_tier2_amount), phone: leadLevel('phone', row.affiliate_tier3_amount) }, closing_level: closingRewardLevel(row.features?.deal_closing_commission?.value ?? row.affiliate_tier4_amount, row.features?.deal_closing_commission?.type ?? row.affiliate_tier4_type, row.deal_type, row.asking_price), attribution: { ...base, broker_name: name } }];
    });
    return json({ properties, has_more: rows.length === limit });
  } catch (error) {
    console.error("[public-listings-board]", error);
    return json({ error: "board lookup failed" }, 500);
  }
});

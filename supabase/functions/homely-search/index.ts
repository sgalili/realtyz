// Smart Matchmaker — property search
//
// Searches properties matching a lead's preferences. Tries Homely first
// (proxied through the user's API key, same pattern as call-homely-api), then
// falls back to the local `listings` table so the feature still works for
// agents who haven't connected Homely yet.
//
// Request body:
//   {
//     lead_id?: uuid,                 // optional; if provided we read lead.preferences
//     min_price?: number,
//     max_price?: number,
//     city?: string,
//     rooms?: number,                     // minimum rooms
//     keywords?: string,                  // freeform query
//     limit?: number                      // default 12
//   }
//
// Returns: { source: "homely" | "listings", results: PropertyResult[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type PropertyResult = {
  id: string;
  source: "homely" | "listings";
  title: string;
  description: string;
  price: number | null;
  currency: string;
  city: string | null;
  rooms: number | null;
  size_sqm: number | null;
  photos: string[];
  url: string | null;
  features: string[];
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeHomelyResult(item: any): PropertyResult {
  const photos: string[] = Array.isArray(item?.photos)
    ? item.photos.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean)
    : Array.isArray(item?.images)
    ? item.images.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean)
    : [];
  return {
    id: String(item?.id ?? item?.listing_id ?? crypto.randomUUID()),
    source: "homely",
    title: item?.title || item?.headline || item?.address || "Property",
    description: item?.description || item?.summary || "",
    price: typeof item?.price === "number" ? item.price : Number(item?.price) || null,
    currency: item?.currency || "₪",
    city: item?.city || item?.location?.city || null,
    rooms: typeof item?.rooms === "number" ? item.rooms : Number(item?.rooms) || null,
    size_sqm: typeof item?.size_sqm === "number" ? item.size_sqm : Number(item?.size_sqm || item?.area) || null,
    photos,
    url: item?.url || item?.public_url || null,
    features: Array.isArray(item?.features) ? item.features : [],
  };
}

function normalizeListing(row: any): PropertyResult {
  const features = Array.isArray(row?.features) ? row.features : [];
  // Try to pull a photo from features (some seed rows store a "photo" entry)
  const photos: string[] = features
    .map((f: any) => (typeof f === "string" ? f : f?.photo || f?.image_url))
    .filter((s: any) => typeof s === "string" && /^https?:\/\//.test(s));
  return {
    id: String(row.id),
    source: "listings",
    title: row.property_title || row.headline || "Property",
    description: row.description || row.thesis || "",
    price: typeof row.asking_price === "number" ? row.asking_price : Number(row.asking_price) || null,
    currency: "₪",
    city: row?.source_metadata?.city || null,
    rooms: row?.source_metadata?.rooms || null,
    size_sqm: row?.source_metadata?.size_sqm || null,
    photos,
    url: row.slug ? `/listing/${row.slug}` : null,
    features: features.filter((f: any) => typeof f === "string"),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    let {
      lead_id,
      min_price,
      max_price,
      city,
      rooms,
      keywords,
      limit = 12,
    } = body as {
      lead_id?: string;
      min_price?: number;
      max_price?: number;
      city?: string;
      rooms?: number;
      keywords?: string;
      limit?: number;
    };

    // Hydrate filters from lead preferences when not explicitly provided
    if (lead_id && (!min_price && !max_price && !city && !rooms)) {
      const { data: lead } = await admin
        .from("leads")
        .select("preferences, city, interest_tag")
        .eq("id", lead_id)
        .maybeSingle();
      const prefs = (lead?.preferences || {}) as Record<string, any>;
      min_price ??= Number(prefs.min_price) || undefined;
      max_price ??= Number(prefs.max_price ?? prefs.budget) || undefined;
      city ??= prefs.city || lead?.city || undefined;
      rooms ??= Number(prefs.rooms ?? prefs.min_rooms) || undefined;
      keywords ??= prefs.keywords || lead?.interest_tag || undefined;
    }

    // ── Try Homely first ──
    const { data: keyRow } = await admin
      .from("user_api_keys")
      .select("homely_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (keyRow?.homely_api_key) {
      try {
        const url = new URL("https://api.homely.com/v1/properties/search");
        if (city) url.searchParams.set("city", city);
        if (min_price) url.searchParams.set("min_price", String(min_price));
        if (max_price) url.searchParams.set("max_price", String(max_price));
        if (rooms) url.searchParams.set("min_rooms", String(rooms));
        if (keywords) url.searchParams.set("q", keywords);
        url.searchParams.set("limit", String(Math.min(50, limit)));

        const upstream = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${keyRow.homely_api_key}`,
            Accept: "application/json",
          },
        });
        if (upstream.ok) {
          const payload = await upstream.json().catch(() => ({}));
          const items: any[] = Array.isArray(payload)
            ? payload
            : payload?.results || payload?.data || payload?.properties || [];
          if (items.length > 0) {
            return json({ source: "homely", results: items.slice(0, limit).map(normalizeHomelyResult) });
          }
        } else {
          console.warn("[homely-search] upstream", upstream.status);
        }
      } catch (e) {
        console.warn("[homely-search] homely call failed", (e as Error).message);
      }
    }

    // ── Fallback: local listings table ──
    let query = admin
      .from("listings")
      .select("id, property_title, description, asking_price, features, headline, thesis, slug, source_metadata")
      .eq("is_published", true)
      .limit(limit);

    if (min_price) query = query.gte("asking_price", min_price);
    if (max_price) query = query.lte("asking_price", max_price);
    if (keywords) {
      // Naive ilike across title + description
      query = query.or(`property_title.ilike.%${keywords}%,description.ilike.%${keywords}%`);
    }

    const { data: rows, error } = await query;
    if (error) return json({ error: error.message }, 500);

    return json({
      source: "listings",
      results: (rows || []).map(normalizeListing),
    });
  } catch (e) {
    console.error("[homely-search] fatal", e);
    await logIntegrationError({
      integration: "homely",
      functionName: "homely-search",
      errorMessage: (e as Error).message,
    });
    return json({ error: (e as Error).message }, 500);
  }
});

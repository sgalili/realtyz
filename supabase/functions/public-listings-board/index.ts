// Public listings board — anonymous, MASKED read path.
//
// This is the only way an unauthenticated visitor can see listings: the
// direct anon SELECT policy on `listings` was removed on purpose, so exact
// street numbers and owner/broker phone numbers can never leak and the
// platform cannot be bypassed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { PUBLIC_CARD_COLUMNS, toPublicCard } from "../_shared/publicMask.ts";

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
      .select(PUBLIC_CARD_COLUMNS)
      .eq("affiliate_enabled", true)
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

    return json({ properties: (data ?? []).map((row) => toPublicCard(row as any)) });
  } catch (error) {
    console.error("[public-listings-board]", error);
    return json({ error: "board lookup failed" }, 500);
  }
});

// Yad2 property search proxy.
// Reads the user's stored Yad2 credentials and attempts to fetch matching
// listings. Yad2 does not expose a stable public API, so this gracefully
// returns { connected: false, results: [] } when no key is configured, and
// surfaces errors as { connected: true, results: [], error } without blowing
// up the UI.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const { city, min_price, max_price, rooms, limit = 24, cities: citiesIn } = body as any;

    const { data: key } = await admin
      .from("user_api_keys")
      .select("yad2_username, yad2_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!key?.yad2_api_key) {
      return json({ source: "yad2", connected: false, results: [] });
    }

    // Udi's primary operating zones — used whenever the caller did not
    // narrow down to a single city. Keeps the Yad2 tab focused instead of
    // returning the entire Israeli market.
    const DEFAULT_CITIES = ["הרצליה", "רמת השרון"];
    const targetCities: string[] = city
      ? [String(city)]
      : Array.isArray(citiesIn) && citiesIn.length > 0
        ? citiesIn.map((c: any) => String(c))
        : DEFAULT_CITIES;

    // Pending-token placeholder mode — the broker is waiting for Yad2 support
    // to issue the official key. Surface a single explanatory row in each
    // targeted city so the UI shows the ingestion plan instead of "0 נכסים".
    if (key.yad2_api_key === "test_pending") {
      const placeholders = targetCities.map((c, i) => ({
        id: `yad2-pending-${i}`,
        source: "yad2",
        title: `ממתין לטוקן יד2 — ${c}`,
        description:
          "החיבור בהמתנה לאישור יד2. ברגע שהטוקן הרשמי יוזן, המערכת תמשוך אוטומטית את הנכסים הפעילים באזור הזה.",
        price: null,
        currency: "₪",
        city: c,
        rooms: null,
        size_sqm: null,
        photos: [],
        url: null,
        features: ["ממתין לאישור Yad2"],
      }));
      return json({
        source: "yad2",
        connected: true,
        status: "pending",
        note: "החיבור בהמתנה לאישור יד2. נתוני הרצליה ורמת השרון יימשכו אוטומטית עם הזנת הטוקן הרשמי.",
        results: placeholders,
      });
    }

    const allResults: any[] = [];
    let lastError: string | null = null;

    for (const targetCity of targetCities) {
      try {
        const url = new URL("https://gw.yad2.co.il/realestate-feed/forsale/map");
        url.searchParams.set("city", targetCity);
        if (min_price) url.searchParams.set("price_min", String(min_price));
        if (max_price) url.searchParams.set("price_max", String(max_price));
        if (rooms) url.searchParams.set("rooms_min", String(rooms));
        const upstream = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${key.yad2_api_key}`, Accept: "application/json" },
        });
        if (!upstream.ok) {
          lastError = `${targetCity}:HTTP ${upstream.status}`;
          continue;
        }
        const payload = await upstream.json().catch(() => ({} as any));
        const items: any[] = Array.isArray(payload) ? payload : payload?.data?.markers || payload?.results || [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          allResults.push({
            id: String(it?.id ?? it?.orderId ?? `yad2-${targetCity}-${i}`),
            source: "yad2",
            title: it?.title || it?.merchandise?.title || it?.address?.text || `נכס Yad2 — ${targetCity}`,
            description: it?.description || "",
            price: Number(it?.price ?? 0) || null,
            currency: "₪",
            city: it?.city || it?.address?.city?.text || targetCity,
            address: it?.address?.text || it?.street || null,
            rooms: Number(it?.rooms ?? it?.additionalDetails?.roomsCount ?? 0) || null,
            size_sqm: Number(it?.squareMeter ?? it?.size ?? 0) || null,
            floor: Number(it?.floor ?? it?.address?.house?.floor ?? 0) || null,
            photos: Array.isArray(it?.images) ? it.images.map((p: any) => p?.src || p).filter(Boolean) : [],
            url: it?.link_url || (it?.id ? `https://www.yad2.co.il/realestate/item/${it.id}` : null),
            features: [],
          });
        }
      } catch (e) {
        lastError = `${targetCity}:${(e as Error).message}`;
      }
    }

    // Best-effort upsert of fresh rows into the local listings table under
    // the 'yad2' source registry so the Properties tab can read them from DB
    // even when the live feed is temporarily down.
    if (allResults.length > 0) {
      try {
        const upserts = allResults.slice(0, 50).map((r) => ({
          user_id: user.id,
          source: "yad2",
          source_external_id: r.id,
          property_title: r.title,
          description: r.description,
          asking_price: r.price,
          city: r.city,
          address: r.address ?? null,
          rooms: r.rooms,
          sqm: r.size_sqm,
          status: "live",
          is_published: true,
          source_metadata: { photos: r.photos, floor: r.floor, url: r.url, cities: targetCities },
          updated_at: new Date().toISOString(),
        }));
        await admin
          .from("listings")
          .upsert(upserts as any, { onConflict: "source,source_external_id" });
      } catch (e) {
        console.warn("[yad2-search] upsert failed", (e as Error).message);
      }
    }

    return json({
      source: "yad2",
      connected: true,
      cities: targetCities,
      results: allResults.slice(0, limit),
      last_error: lastError,
    });
  } catch (e) {
    return json({ source: "yad2", connected: false, results: [], error: (e as Error).message });
  }
});

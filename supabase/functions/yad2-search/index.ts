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
    const { city, min_price, max_price, rooms, limit = 24 } = body as any;

    const { data: key } = await admin
      .from("user_api_keys")
      .select("yad2_username, yad2_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!key?.yad2_api_key) {
      return json({ source: "yad2", connected: false, results: [] });
    }

    try {
      const url = new URL("https://gw.yad2.co.il/realestate-feed/forsale/map");
      if (city) url.searchParams.set("city", city);
      if (min_price) url.searchParams.set("price_min", String(min_price));
      if (max_price) url.searchParams.set("price_max", String(max_price));
      if (rooms) url.searchParams.set("rooms_min", String(rooms));
      const upstream = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${key.yad2_api_key}`, Accept: "application/json" },
      });
      if (!upstream.ok) {
        return json({ source: "yad2", connected: true, results: [], error: `HTTP ${upstream.status}` });
      }
      const payload = await upstream.json().catch(() => ({} as any));
      const items: any[] = Array.isArray(payload) ? payload : payload?.data?.markers || payload?.results || [];
      const results = items.slice(0, limit).map((it: any, i: number) => ({
        id: String(it?.id ?? it?.orderId ?? `yad2-${i}`),
        source: "yad2",
        title: it?.title || it?.merchandise?.title || it?.address?.text || "נכס Yad2",
        description: it?.description || "",
        price: Number(it?.price ?? 0) || null,
        currency: "₪",
        city: it?.city || it?.address?.city?.text || null,
        rooms: Number(it?.rooms ?? it?.additionalDetails?.roomsCount ?? 0) || null,
        size_sqm: Number(it?.squareMeter ?? it?.size ?? 0) || null,
        photos: Array.isArray(it?.images) ? it.images.map((p: any) => p?.src || p).filter(Boolean) : [],
        url: it?.link_url || (it?.id ? `https://www.yad2.co.il/realestate/item/${it.id}` : null),
        features: [],
      }));
      return json({ source: "yad2", connected: true, results });
    } catch (e) {
      return json({ source: "yad2", connected: true, results: [], error: (e as Error).message });
    }
  } catch (e) {
    return json({ source: "yad2", connected: false, results: [], error: (e as Error).message });
  }
});

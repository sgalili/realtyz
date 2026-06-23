// Generates a branded short link for a listing pointing at the broker's
// pre-filled WhatsApp (GreenAPI / wa.me) intro message.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function makeSlug(len = 8) {
  const alpha = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) s += alpha[buf[i] % alpha.length];
  return s;
}

function formatPrice(n: number | null | undefined): string {
  if (!n || !isFinite(Number(n))) return "המחיר המבוקש";
  const v = Number(n);
  return `${v.toLocaleString("he-IL")} ₪`;
}

function normalizePhone(raw: string): string {
  let p = (raw || "").replace(/\D/g, "");
  if (p.startsWith("0")) p = "972" + p.slice(1);
  if (!p.startsWith("972") && p.length === 9) p = "972" + p;
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
    if (!claims?.claims?.sub) return json(401, { error: "Unauthorized" });
    const userId = claims.claims.sub as string;

    const { property_id } = await req.json().catch(() => ({}));
    if (!property_id) return json(400, { error: "property_id required" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: listing, error: lerr } = await admin
      .from("listings")
      .select("id,user_id,property_title,city,neighborhood,address,rooms,asking_price")
      .eq("id", property_id)
      .maybeSingle();
    if (lerr || !listing) return json(404, { error: "Listing not found" });

    // Hard-routed to the dedicated Realtyz WhatsApp agent line.
    const brokerPhone = "972537339533";

    const city = String(listing.city ?? "").trim();
    const neighborhood = String(listing.neighborhood ?? "").trim();
    const rawAddress = String(listing.address ?? "").trim();
    // Strip city/neighborhood tails and house number from address to get street.
    let street = rawAddress;
    if (street && city) street = street.replace(new RegExp(`,?\\s*${city}\\s*$`), "").trim();
    if (street && neighborhood) street = street.replace(new RegExp(`,?\\s*${neighborhood}\\s*$`), "").trim();
    street = street.replace(/\s+\d+[א-ת]?\s*$/, "").trim();

    const price = formatPrice(listing.asking_price as number | null);
    const rooms = listing.rooms ? String(listing.rooms) : "";
    const roomsPart = rooms ? `דירת ${rooms} חדרים במחיר ${price}.` : `במחיר ${price}.`;

    let locationPart: string;
    if (street) {
      locationPart = `ברחוב ${street}${city ? `, ${city}` : ""}`;
    } else if (neighborhood) {
      locationPart = `בשכונת ${neighborhood}${city && city !== neighborhood ? `, ${city}` : ""}`;
    } else {
      locationPart = `ב${city || "האזור"}`;
    }

    const text = `היי אודי, אני פונה אליך לגבי הדירה שפרסמת ${locationPart}. ${roomsPart} אשמח לקבל פרטים נוספים.`;

    const long_url = `https://api.whatsapp.com/send?phone=${brokerPhone}&text=${encodeURIComponent(text)}`;

    // 5 retries to avoid slug collisions
    let slug = "";
    for (let i = 0; i < 5; i++) {
      slug = makeSlug();
      const { error: ierr } = await admin
        .from("short_urls")
        .insert({ slug, property_id, long_url, created_by: userId });
      if (!ierr) break;
      if (i === 4) return json(500, { error: "Could not allocate slug" });
    }

    return json(200, {
      slug,
      short_url: `https://realtyz.co.il/r/${slug}`,
      long_url,
      prefilled_text: text,
    });
  } catch (e) {
    return json(500, { error: String(e?.message ?? e) });
  }
});

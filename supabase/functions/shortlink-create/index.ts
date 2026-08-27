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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripStreet(rawAddress: string, city: string, neighborhood: string): string {
  let street = String(rawAddress ?? "").trim();
  if (street && city) street = street.replace(new RegExp(`,?\\s*${escapeRegExp(city)}\\s*$`), "").trim();
  if (street && neighborhood) street = street.replace(new RegExp(`,?\\s*${escapeRegExp(neighborhood)}\\s*$`), "").trim();
  return street.replace(/\s+\d+[א-ת]?\s*$/, "").trim();
}

function buildLocationPhrase(street: string, neighborhood: string, city: string): string {
  if (street && neighborhood) {
    return city
      ? `ברחוב ${street} ב${neighborhood}, ${city}`
      : `ברחוב ${street} ב${neighborhood}`;
  }
  if (street) return city ? `ברחוב ${street}, ${city}` : `ברחוב ${street}`;
  if (neighborhood) return city ? `בשכונת ${neighborhood}, ${city}` : `בשכונת ${neighborhood}`;
  if (city) return `ב${city}`;
  return "בנכס";
}

function buildDealTypeToken(listing: any): string {
  const raw = String(listing?.deal_type ?? listing?.status ?? "").toLowerCase();
  const isRental =
    listing?.is_rental === true ||
    raw === "rent" || raw === "rental" || raw === "lease" ||
    raw.includes("rent") || raw.includes("להשכרה");
  return isRental ? "להשכרה" : "למכירה";
}

// Official Meta WhatsApp Business number (fallback only — resolved live from
// wa_providers so the CTA never points at a personal / Green API number).
const OFFICIAL_WA_FALLBACK = "972537983832";

async function resolveOfficialWaPhone(admin: any): Promise<string> {
  try {
    const { data } = await admin
      .from("wa_providers")
      .select("config,is_official,is_active")
      .eq("is_official", true)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const cfg = (data?.config ?? {}) as Record<string, unknown>;
    const digits = String(cfg.display_phone_number ?? cfg.phone_number ?? "").replace(/\D/g, "");
    if (digits.length >= 9) return digits;
  } catch { /* fallback */ }
  return OFFICIAL_WA_FALLBACK;
}

function buildShortlinkPayload(listing: any, waPhone: string) {
  const city = String(listing.city ?? "").trim();
  const neighborhood = String(listing.neighborhood ?? "").trim();
  const street = stripStreet(String(listing.address ?? ""), city, neighborhood);
  const locationPhrase = buildLocationPhrase(street, neighborhood, city);
  const dealToken = buildDealTypeToken(listing);
  const rooms = listing.rooms ? String(listing.rooms).trim() : "";
  const price = formatPrice(listing.asking_price as number | null);
  const text = `היי אודי, אני פונה אליך לגבי הדירה ${dealToken} שפרסמת ${locationPhrase}. דירת ${rooms} חדרים במחיר ${price}. אשמח לקבל פרטים נוספים.`;
  const long_url = `https://api.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(text)}`;

  return { street, neighborhood, city, locationPhrase, dealToken, rooms, price, text, long_url };
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

    const { property_id, long_url: rawLongUrl } = await req.json().catch(() => ({}));

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Ad-hoc shortener path: no listing attached, caller just wants a clean
    // realtyz.co.il/r/<slug> alias for an arbitrary long URL (e.g. the WA CTA
    // in the post composer). Reuse an existing slug for the same long_url so
    // rotating the composer checkbox doesn't spam rows.
    if (!property_id) {
      if (!rawLongUrl || typeof rawLongUrl !== "string" || !/^https?:\/\//i.test(rawLongUrl)) {
        return json(400, { error: "property_id or long_url required" });
      }
      const { data: existingAdhoc } = await admin
        .from("short_urls")
        .select("slug")
        .is("property_id", null)
        .eq("long_url", rawLongUrl)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingAdhoc?.slug) {
        return json(200, {
          slug: existingAdhoc.slug,
          short_url: `https://realtyz.co.il/r/${existingAdhoc.slug}`,
          long_url: rawLongUrl,
          reused: true,
        });
      }
      let adhocSlug = "";
      for (let i = 0; i < 5; i++) {
        adhocSlug = makeSlug();
        const { error: ierr } = await admin
          .from("short_urls")
          .insert({ slug: adhocSlug, property_id: null, long_url: rawLongUrl, created_by: userId });
        if (!ierr) break;
        if (i === 4) return json(500, { error: "Could not allocate slug" });
      }
      return json(200, {
        slug: adhocSlug,
        short_url: `https://realtyz.co.il/r/${adhocSlug}`,
        long_url: rawLongUrl,
      });
    }

    const { data: listing, error: lerr } = await admin
      .from("listings")
      .select("id,user_id,property_title,city,neighborhood,address,rooms,asking_price,deal_type,status")
      .eq("id", property_id)
      .maybeSingle();
    if (lerr || !listing) {
      // Return 200 + fallback so callers don't blank-screen on a stale/missing listing id.
      return json(200, {
        error: "LISTING_NOT_FOUND",
        fallback: true,
        long_url: "https://api.whatsapp.com/send?phone=972537339533",
      });
    }

    const { text, long_url } = buildShortlinkPayload(listing);

    // Reuse any existing slug for this listing, but rewrite the stored long_url
    // every time so stale generated rows cannot keep old hardcoded fallback copy.
    const { data: existing } = await admin
      .from("short_urls")
      .select("slug")
      .eq("property_id", property_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.slug) {
      await admin.from("short_urls").update({ long_url }).eq("slug", existing.slug);
      return json(200, {
        slug: existing.slug,
        short_url: `https://realtyz.co.il/r/${existing.slug}`,
        long_url,
        prefilled_text: text,
        refreshed: true,
      });
    }

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

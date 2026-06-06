// Shared grounding helpers: pulls workspace KB excerpts + a live CRM/listings
// snapshot so AI generators always speak from real data instead of inventing.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, service, { auth: { persistSession: false } });
}

export async function loadKbSnippets(
  admin: SupabaseClient,
  userId: string | null,
  limit = 12,
  perChunk = 700,
  totalCap = 6000,
): Promise<string> {
  if (!userId) return "";
  try {
    const { data } = await admin
      .from("knowledge_chunks")
      .select("content")
      .eq("user_id", userId)
      .limit(limit);
    const parts = (data ?? [])
      .map((r: any) => String(r?.content ?? "").trim())
      .filter(Boolean)
      .map((c) => c.slice(0, perChunk));
    return parts.join("\n---\n").slice(0, totalCap);
  } catch {
    return "";
  }
}

export type ListingType = "sale" | "rent";

const SALE_CONTEXT_RE = /(למכירה|מכירה|לרכישה|רכישה|לקנות|לקנייה|לקניה|קנייה|קניה|מחיר מבוקש|משכנתא|for sale|asking price|purchase|buying?|mortgage)/i;
const RENT_CONTEXT_RE = /(להשכרה|השכרה|שכירות|לשכור|להשכיר|שכר דירה|שכ"?ד|דמי שכירות|rentals?|for rent|lease|to let|monthly rent)/i;

function searchableListingText(listing: Record<string, unknown>): string {
  return [
    listing.property_title,
    listing.status,
    listing.features ? JSON.stringify(listing.features) : "",
  ].map((value) => String(value ?? "").toLowerCase()).join("\n");
}

export function extractListingTypeFromFeatures(features: unknown): ListingType | null {
  if (Array.isArray(features)) {
    for (const f of features) {
      if (f && typeof f === "object" && "listing_type" in (f as any)) {
        const v = String((f as any).listing_type ?? "").toLowerCase();
        if (v === "rent") return "rent";
        if (v === "sale") return "sale";
      }
    }
    return null;
  }
  if (features && typeof features === "object") {
    const v = String((features as any).listing_type ?? "").toLowerCase();
    if (v === "rent") return "rent";
    if (v === "sale") return "sale";
  }
  return null;
}

// Price-based heuristic — the DB mixes sale and rent rows. Owner rule:
// • price in the thousands (< 100k ₪)  → rent / looking to rent
// • price ≥ ~100k ₪ (typically 1M+)    → sale / looking to buy
// Returns null for the small ambiguous band so explicit signals can win.
export function inferListingTypeFromPrice(price: unknown): ListingType | null {
  const n = Number(price ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 50_000) return "rent";
  if (n >= 100_000) return "sale";
  return null;
}

// Best-effort classifier: explicit feature flag wins, otherwise fall back to
// the price heuristic so mixed-DB rows still land in the right pipeline.
export function resolveListingType(listing: Record<string, unknown>): ListingType | null {
  const explicit = extractListingTypeFromFeatures(listing.features);
  if (explicit) return explicit;
  return inferListingTypeFromPrice(listing.asking_price);
}

export function isListingAllowedForType(listing: Record<string, unknown>, want: ListingType | null): boolean {
  if (!want) return true;
  const explicit = extractListingTypeFromFeatures(listing.features);
  const priceType = inferListingTypeFromPrice(listing.asking_price);
  const price = Number(listing.asking_price ?? 0);
  const text = searchableListingText(listing);

  if (want === "rent") {
    if (explicit === "sale") return false;
    if (priceType === "sale") return false; // price ≥ 100k → treat as sale, never as rent
    if (Number.isFinite(price) && price > 50_000) return false;
    if (SALE_CONTEXT_RE.test(text)) return false;
    return explicit === "rent" || priceType === "rent" || RENT_CONTEXT_RE.test(text) || !price || price <= 50_000;
  }

  // want === "sale"
  if (explicit === "rent") return false;
  if (priceType === "rent") return false; // price in the thousands → rental, not sale
  if (RENT_CONTEXT_RE.test(text)) return false;
  return true;
}

export type CrmSnapshot = {
  total_listings: number;
  cities: { city: string; count: number }[];
  sample_listings: {
    title: string;
    city: string | null;
    rooms: number | null;
    sqm: number | null;
    asking_price: number | null;
    listing_type: ListingType | null;
    description: string | null;
    address: string | null;
    neighborhood: string | null;
  }[];
  active_leads: number;
  hot_leads: number;
  listing_type_filter: ListingType | null;
};

export async function loadCrmSnapshot(
  admin: SupabaseClient,
  userId: string | null,
  opts: { listingType?: ListingType | null } = {},
): Promise<CrmSnapshot | null> {
  if (!userId) return null;
  try {
    const [listingsRes, leadsRes] = await Promise.all([
      admin
        .from("listings")
        .select("property_title,city,address,neighborhood,rooms,sqm,asking_price,status,is_published,features,description")
        .eq("user_id", userId)
        .eq("status", "live")
        .eq("is_published", true)
        .limit(80),
      admin
        .from("leads")
        .select("lead_stage,is_demo")
        .eq("user_id", userId)
        .eq("is_demo", false)
        .limit(500),
    ]);
    const rawListings = (listingsRes.data ?? []).map((l: any) => ({
      ...l,
      listing_type: resolveListingType(l),
    }));
    // Strict pipeline separator: when caller specifies the deal type, NEVER
    // bleed the other side into the snapshot. A rental lead must never see
    // sale listings, and vice-versa.
    const want = opts.listingType ?? null;
    const listings = want
      ? rawListings
          .filter((l: any) => isListingAllowedForType(l, want))
          .map((l: any) => ({ ...l, listing_type: want }))
      : rawListings;
    const leads = leadsRes.data ?? [];
    const cityMap = new Map<string, number>();
    for (const l of listings) {
      const c = (l.city ?? "").trim();
      if (!c) continue;
      cityMap.set(c, (cityMap.get(c) ?? 0) + 1);
    }
    const cities = Array.from(cityMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([city, count]) => ({ city, count }));
    const sample = listings.slice(0, 8).map((l: any) => ({
      title: String(l.property_title ?? "").slice(0, 80),
      city: l.city ?? null,
      rooms: l.rooms ?? null,
      sqm: l.sqm ?? null,
      asking_price: l.asking_price ?? null,
      listing_type: l.listing_type as ListingType | null,
    }));
    const hot = leads.filter((l: any) =>
      ["hot", "negotiation", "closing", "qualified"].includes(String(l.lead_stage ?? "").toLowerCase()),
    ).length;
    return {
      total_listings: listings.length,
      cities,
      sample_listings: sample,
      active_leads: leads.length,
      hot_leads: hot,
      listing_type_filter: want,
    };
  } catch {
    return null;
  }
}

export function renderCrmBlock(snap: CrmSnapshot | null): string {
  if (!snap) {
    return "[LIVE PROPERTIES & CRM CONTEXT]: (unavailable — do NOT invent listings, cities, or prices. Speak only from KB expertise.)";
  }
  const cityLine = snap.cities.length
    ? snap.cities.map((c) => `${c.city} (${c.count})`).join(", ")
    : "(no city data)";
  const samples = snap.sample_listings.length
    ? snap.sample_listings
        .map((l, index) => {
          const typeHe = l.listing_type === "rent"
            ? "להשכרה"
            : l.listing_type === "sale"
            ? "למכירה"
            : null;
          const priceLabel = l.listing_type === "rent" ? "שכ\"ד ₪/חודש" : "מחיר מבוקש";
          const parts = [
            l.title || "ללא כותרת",
            typeHe ? `סוג עסקה: ${typeHe}` : null,
            l.city ? `עיר: ${l.city}` : null,
            l.rooms ? `${l.rooms} חדרים` : null,
            l.sqm ? `${l.sqm} מ"ר` : null,
            l.asking_price ? `${priceLabel}: ${Number(l.asking_price).toLocaleString("he-IL")} ש"ח` : null,
          ].filter(Boolean);
          return `OBJECT_${index + 1}: ${parts.join(" | ")}`;
        })
        .join("\n")
    : "(no live listings)";
  const filterLine = snap.listing_type_filter
    ? `STRICT TRANSACTION FILTER: only ${snap.listing_type_filter === "rent" ? "RENTAL (להשכרה)" : "SALE (למכירה)"} listing objects are listed below. NEVER cross-quote a ${snap.listing_type_filter === "rent" ? "SALE" : "RENTAL"} property. Treat this block as the only allowed property payload.`
    : null;
  return [
    "[LIVE PROPERTIES & CRM CONTEXT] (STRICT DYNAMIC PAYLOAD ARRAY — workspace-scoped real DB rows only. Quote only these OBJECT_* entries. Never use examples, memory, previous drafts, campaign history, or invented addresses/prices.):",
    filterLine,
    `Active live listings: ${snap.total_listings}`,
    `Active regions: ${cityLine}`,
    `Pipeline: ${snap.active_leads} active leads, ${snap.hot_leads} hot/negotiation`,
    `Allowed real-estate objects:\n${samples}`,
  ].filter(Boolean).join("\n");
}

export function renderKbBlock(kb: string): string {
  if (!kb) {
    return "[WORKSPACE KNOWLEDGE BASE]: (empty — if a factual question arises outside general expertise, honestly say you'll verify and follow up in DM. Do NOT invent.)";
  }
  return `[WORKSPACE KNOWLEDGE BASE] (highest priority — every assertion must be grounded strictly in these excerpts):\n"""${kb}"""`;
}

export const UDI_PERSONA = `PERSONA (LOCKED): You are Udi Vitman — a high-end, elite Israeli real-estate broker writing personally. Authoritative, polished, deeply local to the Israeli market, no fluff, no AI tells. You speak as a senior advisor who closes deals, not as a chatbot. Every output sounds like a busy expert typed it himself.`;

export const ANTI_SPAM_RULES = `ANTI-SPAM HIGH-ENTROPY RULES (Meta-safety; prevents template detection):
- Treat each output as a fingerprint that must be unique vs all prior outputs. Never reuse the same opener, sentence skeleton, or closing line.
- Heavily vary sentence structure, length, vocabulary, register, and rhythm. Mix short punchy sentences with one longer reflective sentence.
- Forbidden generic openers: "תודה על התגובה", "שאלה מצוינת", "היי", "שלום", "Thanks for your comment", "Great question". Find a fresh, specific opener every time.
- No asterisks, em-dashes, en-dashes, double dashes, markdown, hashtags. At most 1 tasteful emoji, often zero.
- Never say "I am an AI" / "as a bot" / "automated message".`;

export const CTA_RULE = `CTA: close with ONE compelling, context-aware Call-To-Action that nudges the reader to message via Messenger / WhatsApp or contact the office directly. Phrase the CTA differently every single time.`;

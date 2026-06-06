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

export type CrmSnapshot = {
  total_listings: number;
  cities: { city: string; count: number }[];
  sample_listings: {
    title: string;
    city: string | null;
    rooms: number | null;
    sqm: number | null;
    asking_price: number | null;
  }[];
  active_leads: number;
  hot_leads: number;
};

export async function loadCrmSnapshot(
  admin: SupabaseClient,
  userId: string | null,
): Promise<CrmSnapshot | null> {
  if (!userId) return null;
  try {
    const [listingsRes, leadsRes] = await Promise.all([
      admin
        .from("listings")
        .select("property_title,city,rooms,sqm,asking_price,status,is_published")
        .eq("user_id", userId)
        .eq("status", "live")
        .eq("is_published", true)
        .limit(40),
      admin
        .from("leads")
        .select("lead_stage,is_demo")
        .eq("user_id", userId)
        .eq("is_demo", false)
        .limit(500),
    ]);
    const listings = listingsRes.data ?? [];
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
    const sample = listings.slice(0, 6).map((l: any) => ({
      title: String(l.property_title ?? "").slice(0, 80),
      city: l.city ?? null,
      rooms: l.rooms ?? null,
      sqm: l.sqm ?? null,
      asking_price: l.asking_price ?? null,
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
        .map((l) => {
          const parts = [
            l.title || "ללא כותרת",
            l.city ? `עיר: ${l.city}` : null,
            l.rooms ? `${l.rooms} חדרים` : null,
            l.sqm ? `${l.sqm} מ"ר` : null,
            l.asking_price ? `מחיר מבוקש: ${Number(l.asking_price).toLocaleString("he-IL")} ש"ח` : null,
          ].filter(Boolean);
          return `- ${parts.join(" | ")}`;
        })
        .join("\n")
    : "(no live listings)";
  return [
    "[LIVE PROPERTIES & CRM CONTEXT] (workspace-scoped, real DB rows — quote only these, never invent new ones):",
    `Active live listings: ${snap.total_listings}`,
    `Active regions: ${cityLine}`,
    `Pipeline: ${snap.active_leads} active leads, ${snap.hot_leads} hot/negotiation`,
    `Sample live listings:\n${samples}`,
  ].join("\n");
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

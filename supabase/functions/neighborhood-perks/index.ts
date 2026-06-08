// neighborhood-perks
// Enriches a listing with 4-6 short Hebrew bullets describing nearby-area
// perks (schools, parks, transit, beach, cafes, gyms, etc.) so the AI can
// drop one or two into marketing posts and comment replies.
//
// Strategy:
//   1. Resolve listing (id) → address/neighborhood/city.
//   2. If listings.area_perks is fresh (<30 days), return it.
//   3. Otherwise: Firecrawl /v2/search across yad2.co.il + Google snippets
//      for "{neighborhood} {city} שכונה" + "{address} סביבה".
//   4. Send snippets to Lovable AI Gateway → strict JSON {perks: string[]}.
//   5. Cache to listings.area_perks and return.
//
// Public POST body: { listing_id: string, force?: boolean }
// Auth: user JWT (RLS-scoped) required; admin client used only to upsert cache.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const CACHE_TTL_DAYS = 30;

type Perks = {
  perks: string[];           // 4-6 short Hebrew bullets
  one_liner_he: string;      // single 8-14 word sentence summary
  sources: string[];         // URLs that contributed
  fetched_at: string;        // ISO
};

async function firecrawlSearch(query: string, limit = 5): Promise<Array<{ url: string; title?: string; description?: string; markdown?: string }>> {
  if (!FIRECRAWL_API_KEY) return [];
  try {
    const r = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit, lang: "he", country: "il" }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      console.warn("[neighborhood-perks] firecrawl search failed", r.status, j);
      return [];
    }
    // v2 shape: { success, data: { web: [{url,title,description,markdown?}, ...] } } OR { data: [...] }
    const web = j?.data?.web ?? j?.data ?? [];
    return Array.isArray(web) ? web : [];
  } catch (e) {
    console.error("[neighborhood-perks] firecrawl error", e);
    return [];
  }
}

async function summarizeWithAI(payload: {
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  snippets: string;
}): Promise<{ perks: string[]; one_liner_he: string } | null> {
  if (!LOVABLE_API_KEY) return null;
  const sys = `אתה מתווך נדל"ן בכיר בישראל. סכם בעברית את היתרונות של הסביבה הקרובה לנכס בהתבסס אך ורק על קטעי הטקסט המצורפים. כללים:
- החזר JSON תקין בלבד עם המפתחות perks (מערך 4-6 פריטים) ו-one_liner_he (משפט אחד 8-14 מילים).
- כל פריט: עד 7 מילים, קונקרטי (למשל "5 דקות הליכה לחוף", "סופר יוחננוף בכניסה לשכונה", "קו רכבת קלה בקרבת מקום", "פארק הרצליה במרחק 400 מ׳").
- ללא אימוג'י, ללא קווים מפרידים (em dash/en dash), ללא "—" או "--".
- אם אין מספיק מידע, החזר perks ריק ו-one_liner_he ריק.`;
  const user = `נכס: ${payload.address ?? ""}, ${payload.neighborhood ?? ""}, ${payload.city ?? ""}\n\nקטעים מהאינטרנט (yad2 / Google):\n"""${payload.snippets.slice(0, 6000)}"""`;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        response_format: { type: "json_object" },
      }),
    });
    const j = await r.json();
    if (!r.ok) { console.warn("[neighborhood-perks] AI failed", r.status, j); return null; }
    const content = j?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    const perks: string[] = Array.isArray(parsed?.perks)
      ? parsed.perks.map((p: any) => String(p).trim()).filter(Boolean).slice(0, 6)
      : [];
    const one = typeof parsed?.one_liner_he === "string" ? parsed.one_liner_he.trim() : "";
    return { perks, one_liner_he: one };
  } catch (e) {
    console.error("[neighborhood-perks] AI parse error", e);
    return null;
  }
}

function isFresh(perks: any): perks is Perks {
  if (!perks || typeof perks !== "object") return false;
  if (!Array.isArray(perks.perks) || perks.perks.length === 0) return false;
  const t = Date.parse(perks.fetched_at ?? "");
  if (!Number.isFinite(t)) return false;
  return (Date.now() - t) < CACHE_TTL_DAYS * 24 * 3600 * 1000;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const listingId = String(body?.listing_id ?? "").trim();
    const force = Boolean(body?.force);
    if (!listingId) {
      return new Response(JSON.stringify({ error: "listing_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const user = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: listing, error: lerr } = await user
      .from("listings")
      .select("id, user_id, property_title, address, neighborhood, city, area_perks")
      .eq("id", listingId)
      .maybeSingle();
    if (lerr || !listing) {
      return new Response(JSON.stringify({ error: "listing not found or forbidden" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!force && isFresh((listing as any).area_perks)) {
      return new Response(JSON.stringify({ ok: true, cached: true, area_perks: (listing as any).area_perks }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const address = (listing as any).address ?? null;
    const neighborhood = (listing as any).neighborhood ?? null;
    const city = (listing as any).city ?? null;
    if (!city && !neighborhood && !address) {
      return new Response(JSON.stringify({ ok: false, error: "no address/neighborhood/city" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Search yad2 + general Google snippets via Firecrawl
    const queries = [
      neighborhood && city ? `site:yad2.co.il ${neighborhood} ${city}` : null,
      neighborhood && city ? `${neighborhood} ${city} שכונה יתרונות בתי ספר תחבורה` : null,
      address && city ? `${address} ${city} סביבה פארק חניה תחבורה` : null,
    ].filter(Boolean) as string[];

    const results: Array<{ url: string; title?: string; description?: string; markdown?: string }> = [];
    for (const q of queries) {
      const r = await firecrawlSearch(q, 4);
      results.push(...r);
    }
    const dedup = new Map<string, typeof results[number]>();
    for (const r of results) if (r?.url && !dedup.has(r.url)) dedup.set(r.url, r);
    const top = Array.from(dedup.values()).slice(0, 10);

    const snippets = top.map((r) => `• ${r.title ?? ""}\n${r.description ?? ""}\n${(r.markdown ?? "").slice(0, 400)}`).join("\n---\n");
    const summary = await summarizeWithAI({ address, neighborhood, city, snippets });
    if (!summary || summary.perks.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "no perks extracted", searched: queries }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const area_perks: Perks = {
      perks: summary.perks,
      one_liner_he: summary.one_liner_he,
      sources: top.map((r) => r.url).slice(0, 8),
      fetched_at: new Date().toISOString(),
    };

    await admin.from("listings").update({ area_perks }).eq("id", listingId);

    return new Response(JSON.stringify({ ok: true, cached: false, area_perks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[neighborhood-perks] fatal", e);
    return new Response(JSON.stringify({ error: e?.message ?? "internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

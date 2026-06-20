/**
 * parse-listing-text
 * Accepts either pasted listing text OR a URL (Yad2/Madlan/etc.).
 * - If input is a URL, scrape via Firecrawl (markdown + html + screenshot links)
 *   then ask the LLM to extract structured fields + photos.
 * - If input is plain text, run LLM extraction directly.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

const PROPERTY_TYPES = [
  "apartment", "garden_apartment", "penthouse", "duplex",
  "private_house", "cottage", "studio", "loft", "commercial", "land", "other",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!LOVABLE_API_KEY) return json({ error: "AI gateway not configured" }, 500);

  try {
    const { text } = await req.json().catch(() => ({}));
    if (!text || typeof text !== "string" || text.trim().length < 5) {
      return json({ error: "text is required" }, 400);
    }

    const trimmed = text.trim();
    const isUrl = /^https?:\/\/\S+$/i.test(trimmed);

    let payload = trimmed;
    let sourceUrl: string | null = null;
    let scrapedPhotos: string[] = [];

    if (isUrl) {
      sourceUrl = trimmed;
      if (!FIRECRAWL_API_KEY) {
        return json({ error: "URL ingestion requires Firecrawl. הדבק טקסט במקום." }, 400);
      }
      try {
        const fcRes = await fetch("https://api.firecrawl.dev/v2/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: trimmed,
            formats: ["markdown", "html"],
            onlyMainContent: false,
            waitFor: 1500,
            location: { country: "IL", languages: ["he", "en"] },
          }),
        });
        const fcData = await fcRes.json().catch(() => ({}));
        if (!fcRes.ok) {
          return json({ error: "scrape_failed", detail: JSON.stringify(fcData).slice(0, 400) }, 502);
        }
        const doc = fcData?.data ?? fcData;
        const md = doc?.markdown ?? "";
        const html = doc?.html ?? doc?.rawHtml ?? "";
        scrapedPhotos = extractPhotos(html, trimmed);
        payload = `URL: ${trimmed}\n\nMARKDOWN:\n${md.slice(0, 6000)}\n\nIMAGES_FOUND:\n${scrapedPhotos.slice(0, 12).join("\n")}`;
      } catch (e: any) {
        return json({ error: "scrape_exception", detail: String(e?.message ?? e) }, 502);
      }
    }

    const system = `You extract Israeli real-estate listing data from Hebrew/English content (Yad2, Madlan, WhatsApp forwards, free notes).
Return ONLY a strict JSON object matching this shape (use null when unknown):
{
  "property_type": one of ${JSON.stringify(PROPERTY_TYPES)},
  "listing_type": "sale" | "rent",
  "city": string|null,
  "neighborhood": string|null,
  "rooms": number|null,
  "price": integer|null,
  "sqm": integer|null,
  "floor": number|null,
  "title": string|null,
  "description": string|null,
  "parking": integer|null,
  "air_conditioning": boolean,
  "solar_heater": boolean,
  "shelter": boolean,
  "elevator": boolean,
  "photos": string[]   // image URLs (jpg/png/webp). Prefer IMAGES_FOUND list if present. Max 12.
}
Rules:
- "להשכרה" / "שכירות" / monthly-magnitude price => rent. "למכירה" => sale.
- Strip currency symbols / thousands separators from price.
- Detect amenities: מיזוג=>air_conditioning, דוד שמש=>solar_heater, מקלט / ממ"ד=>shelter, מעלית=>elevator, חניות N=>parking=N.
- Never invent data. Use null/false when uncertain.
- For photos, return real image URLs only (must start with http). Do not include logos/ads.
- Output JSON only.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: payload.slice(0, 12000) },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiResp.status === 429) return json({ error: "rate_limited" }, 429);
    if (aiResp.status === 402) return json({ error: "credits_exhausted" }, 402);
    if (!aiResp.ok) {
      const t = await aiResp.text();
      return json({ error: "ai_failed", detail: t.slice(0, 500) }, 502);
    }
    const data = await aiResp.json();
    const content = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    const aiPhotos = Array.isArray(parsed.photos)
      ? parsed.photos.filter((p: any) => typeof p === "string" && /^https?:\/\//.test(p))
      : [];
    const photos = dedupe([...aiPhotos, ...scrapedPhotos]).slice(0, 15);

    const out = {
      property_type: PROPERTY_TYPES.includes(parsed.property_type) ? parsed.property_type : "apartment",
      listing_type: parsed.listing_type === "rent" ? "rent" : "sale",
      city: cleanStr(parsed.city),
      neighborhood: cleanStr(parsed.neighborhood),
      rooms: toNum(parsed.rooms),
      price: toInt(parsed.price),
      sqm: toInt(parsed.sqm),
      floor: toNum(parsed.floor),
      title: cleanStr(parsed.title),
      description: cleanStr(parsed.description),
      parking: toInt(parsed.parking),
      air_conditioning: !!parsed.air_conditioning,
      solar_heater: !!parsed.solar_heater,
      shelter: !!parsed.shelter,
      elevator: !!parsed.elevator,
      photos,
      source_url: sourceUrl,
    };

    return json({ ok: true, data: out });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function extractPhotos(html: string, baseUrl: string): string[] {
  if (!html) return [];
  const urls = new Set<string>();
  // og:image
  for (const m of html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi)) {
    urls.add(absolutize(m[1], baseUrl));
  }
  // <img src>
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi)) {
    urls.add(absolutize(m[1], baseUrl));
  }
  // background-image inline
  for (const m of html.matchAll(/background-image:\s*url\(["']?([^"')]+\.(?:jpg|jpeg|png|webp)[^"')]*)["']?\)/gi)) {
    urls.add(absolutize(m[1], baseUrl));
  }
  // generic JSON image fields
  for (const m of html.matchAll(/"(?:image|imageUrl|src|url)"\s*:\s*"(https?:[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi)) {
    urls.add(m[1]);
  }
  return [...urls]
    .filter((u) => /^https?:\/\//.test(u))
    .filter((u) => !/logo|sprite|icon|favicon|placeholder/i.test(u))
    .slice(0, 20);
}

function absolutize(u: string, base: string): string {
  try { return new URL(u, base).toString(); } catch { return u; }
}
function dedupe<T>(arr: T[]): T[] { return [...new Set(arr)]; }
function cleanStr(v: any): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}
function toNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toInt(v: any): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}
function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

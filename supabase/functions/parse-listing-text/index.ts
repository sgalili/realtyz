/**
 * parse-listing-text
 * Takes raw pasted listing text (Yad2/Madlan/free form) and returns a
 * structured JSON object the AddPropertyDialog can use to prefill fields.
 * No DB writes. Pure AI extraction.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

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
    if (!text || typeof text !== "string" || text.trim().length < 10) {
      return json({ error: "text is required (min 10 chars)" }, 400);
    }

    const system = `You extract Israeli real-estate listing data from unstructured Hebrew/English text (Yad2, Madlan, WhatsApp forwards, free notes).
Return ONLY a strict JSON object matching this shape (use null when unknown):
{
  "property_type": one of ${JSON.stringify(PROPERTY_TYPES)},
  "listing_type": "sale" | "rent",
  "city": string|null,
  "neighborhood": string|null,
  "rooms": number|null,
  "price": integer|null,    // pure integer ILS, no commas, no symbols
  "sqm": integer|null,
  "floor": number|null,
  "title": string|null,     // short Hebrew headline
  "description": string|null // 1-3 sentence Hebrew summary including key notes (parking, elevator, balcony, renovated, etc.)
}
Rules:
- Detect rent vs sale from price magnitude and keywords (להשכרה / שכירות => rent; למכירה / מחיר => sale).
- Strip currency symbols and thousands separators from price.
- If multiple numbers appear, prefer the one labeled מחיר / Price.
- Never invent data. Use null when uncertain.
- Output JSON only. No markdown fence, no commentary.`;

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
          { role: "user", content: text.slice(0, 8000) },
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

    // Normalize
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
    };

    return json({ ok: true, data: out });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

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

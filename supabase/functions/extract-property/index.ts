/**
 * Smart Property Extraction.
 *
 * Background extractor: scans the latest user/lead message (and a few prior
 * turns of context) for STRUCTURED property data (address, price, sqm, rooms,
 * floor, parking, elevator, deal type, neighborhood) and, when found with
 * sufficient confidence, inserts a PENDING row into `public.listings` so the
 * Agent can audit it from the dashboard.
 *
 * Idempotency: duplicates are avoided by skipping inserts when a recent
 * pending row exists for the same lead with the same address+price hash.
 *
 * Designed to be invoked fire-and-forget from `ai-agent` (and similar inbound
 * webhooks). It MUST never block the user's reply.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface Body {
  /** REQUIRED: lead the conversation belongs to (also used for dedupe). */
  lead_id: string;
  /** Optional message id we extracted from (for audit). */
  message_id?: string | null;
  /** Latest inbound text from the lead. REQUIRED. */
  text: string;
  /** Recent prior turns for context (oldest first). Optional. */
  context_messages?: Array<{ role: string; content: string }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    if (!LOVABLE_API_KEY) return json({ error: "AI gateway not configured" }, 500);

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body?.lead_id || !body.text?.trim()) {
      return json({ error: "lead_id and text are required" }, 400);
    }

    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    // Cheap pre-filter: only spend an AI call when the text plausibly mentions a property.
    if (!looksLikeProperty(body.text)) {
      return json({ ok: true, skipped: true, reason: "no_property_signals" });
    }

    const recentContext = (body.context_messages ?? [])
      .slice(-6)
      .map((m) => `[${m.role}] ${String(m.content ?? "").slice(0, 600)}`)
      .join("\n");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: [
              "You extract STRUCTURED real-estate property data from a single conversational message.",
              "Be conservative. Only return a property if the message clearly describes ONE specific physical property (apartment, house, garden flat, plot, etc.) with at least TWO concrete attributes (e.g. address+price, or rooms+sqm+city, or street+price).",
              "Generic interest ('I'm looking for a 4-room apartment in Tel Aviv') is NOT a property listing, return found=false.",
              "Numbers: Hebrew real-estate uses 'מ\"ר' for sqm, 'חדרים' for rooms, 'קומה' for floor, 'חניה' for parking, 'מעלית' for elevator, '₪' or 'ש\"ח' for price (often 'מיליון' = 1,000,000).",
              "If price is given as 'X מיליון', convert to integer shekels (e.g. '2.4 מיליון' -> 2400000).",
              "Detect deal_type: 'sale' (למכירה / מוכר / מבקש X ₪) vs 'rent' (להשכרה / שכירות / X לחודש).",
              "Output ONLY via the save_property tool, no prose.",
            ].join(" "),
          },
          {
            role: "user",
            content:
              `RECENT CONTEXT (oldest first):\n${recentContext || "(none)"}\n\n` +
              `LATEST MESSAGE TO EXTRACT FROM:\n${body.text.trim().slice(0, 4000)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "save_property",
              description: "Return a structured property if and only if the message describes one specific property. Otherwise return found=false.",
              parameters: {
                type: "object",
                properties: {
                  found: { type: "boolean" },
                  confidence: { type: "number", minimum: 0, maximum: 1, description: "0..1, your confidence that this is a real listing." },
                  property_title: { type: "string", description: "Short Hebrew title, e.g. 'דירת 4 חדרים, רמת השרון'." },
                  description: { type: "string", description: "1-3 sentence Hebrew description summarising the property." },
                  deal_type: { type: "string", enum: ["sale", "rent", "unknown"] },
                  asking_price: { type: "number", description: "Integer shekels. 0 if unknown." },
                  city: { type: "string" },
                  neighborhood: { type: "string" },
                  address: { type: "string", description: "Street + number if present." },
                  rooms: { type: "number", description: "e.g. 3, 3.5, 4." },
                  sqm: { type: "integer", description: "Built area in sqm." },
                  floor: { type: "integer" },
                  parking: { type: "boolean" },
                  elevator: { type: "boolean" },
                  features: { type: "array", items: { type: "string" }, description: "Hebrew bullet list e.g. ['מרפסת שמש', 'מחסן', 'משופצת']." },
                },
                required: ["found", "confidence"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "save_property" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return json({ error: "Rate limited" }, 429);
      if (aiResp.status === 402) return json({ error: "AI credits exhausted" }, 402);
      const t = await aiResp.text();
      console.error("AI extraction error:", aiResp.status, t);
      return json({ error: "AI extraction failed" }, 502);
    }

    const aiJson = await aiResp.json();
    const argsRaw = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsRaw) return json({ ok: true, skipped: true, reason: "no_tool_call" });

    let extracted: any;
    try { extracted = JSON.parse(argsRaw); } catch {
      return json({ ok: true, skipped: true, reason: "bad_json" });
    }

    const found = !!extracted?.found;
    const conf = Number(extracted?.confidence ?? 0);
    if (!found || conf < 0.55) {
      return json({ ok: true, skipped: true, reason: "low_confidence", confidence: conf });
    }

    // Dedupe: same lead + same address (if any) + price within 1% + last 7 days.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const askingPrice = Number(extracted.asking_price ?? 0) || 0;
    const address = (extracted.address ?? "").toString().trim();
    let dupeQuery = supa
      .from("listings")
      .select("id, asking_price, address")
      .eq("user_id", userId)
      .eq("extracted_from_lead_id", body.lead_id)
      .eq("source", "ai_extraction")
      .gte("created_at", sevenDaysAgo)
      .limit(20);
    const { data: maybeDupes } = await dupeQuery;
    const isDupe = (maybeDupes ?? []).some((row: any) => {
      const sameAddr = address && row.address && String(row.address).trim().toLowerCase() === address.toLowerCase();
      const samePrice = askingPrice > 0 && Number(row.asking_price ?? 0) > 0
        && Math.abs(Number(row.asking_price) - askingPrice) / askingPrice < 0.01;
      return sameAddr || samePrice;
    });
    if (isDupe) {
      return json({ ok: true, skipped: true, reason: "duplicate" });
    }

    const slug = `pending-${crypto.randomUUID().slice(0, 8)}`;
    const features = Array.isArray(extracted.features)
      ? extracted.features.filter((s: any) => typeof s === "string").slice(0, 20)
      : [];

    const insertPayload = {
      user_id: userId,
      slug,
      property_title: String(extracted.property_title ?? `דירה חדשה (${body.lead_id.slice(0, 6)})`).slice(0, 200),
      description: String(extracted.description ?? "").slice(0, 4000) || "(נדלה משיחה. נא להשלים פרטים.)",
      asking_price: askingPrice,
      features,
      city: extracted.city ?? null,
      neighborhood: extracted.neighborhood ?? null,
      address: address || null,
      rooms: typeof extracted.rooms === "number" ? extracted.rooms : null,
      sqm: typeof extracted.sqm === "number" ? extracted.sqm : null,
      floor: typeof extracted.floor === "number" ? extracted.floor : null,
      parking: typeof extracted.parking === "boolean" ? extracted.parking : null,
      elevator: typeof extracted.elevator === "boolean" ? extracted.elevator : null,
      is_published: false,
      status: "pending",
      source: "ai_extraction",
      extracted_from_lead_id: body.lead_id,
      extracted_from_message_id: body.message_id ?? null,
      extraction_metadata: {
        confidence: conf,
        deal_type: extracted.deal_type ?? "unknown",
        extracted_at: new Date().toISOString(),
        source_text_preview: body.text.slice(0, 400),
        model: "google/gemini-3-flash-preview",
      },
    };

    const { data: inserted, error: insErr } = await supa
      .from("listings")
      .insert(insertPayload)
      .select("id")
      .single();
    if (insErr) {
      console.error("pending listing insert failed:", insErr);
      return json({ error: insErr.message }, 500);
    }

    // Best-effort audit log.
    await supa.from("audit_logs").insert({
      action: "listings.ai_extracted",
      actor_id: userId,
      actor_email: userData.user.email ?? null,
      target_table: "listings",
      target_id: inserted.id,
      details: {
        lead_id: body.lead_id,
        confidence: conf,
        deal_type: extracted.deal_type ?? "unknown",
      },
    }).catch(() => undefined);

    return json({
      ok: true,
      created: true,
      listing_id: inserted.id,
      confidence: conf,
    });
  } catch (e) {
    console.error("extract-property error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

/** Cheap heuristic: does the text plausibly contain property attributes? */
function looksLikeProperty(text: string): boolean {
  const t = String(text ?? "").toLowerCase();
  if (t.length < 12) return false;
  // Hebrew / English signals: rooms, sqm, price unit, floor, parking, elevator, listing/rent verbs.
  const signals = [
    /\d+(\.\d+)?\s*חדר/i,
    /\d+\s*מ"ר|\d+\s*מ\u05F4ר|\d+\s*מ׳ר|\d+\s*sqm/i,
    /קומה\s*\d+/i,
    /חני(ה|ות)/i,
    /מעלית/i,
    /מרפסת/i,
    /למכירה|להשכרה|שכירות|מוכר|להשכיר/i,
    /\d{1,3}(,\d{3})+\s*(₪|ש"?ח|nis|shekel)/i,
    /\d+(\.\d+)?\s*מיליון/i,
    /רחוב\s+\S+\s+\d+/i,
    /\b(apartment|flat|house|villa|penthouse|studio)\b/i,
    /\b\d+\s*(bed|br|bedroom|sqm|m2)\b/i,
  ];
  return signals.some((re) => re.test(t));
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Generate vector embeddings via Lovable AI Gateway (Gemini text-embedding-004 → 768 dims).
// Modes:
//  - { listing_id }            → embed listing, store in listings.embedding, return vector
//  - { text }                  → embed arbitrary text, return vector
//  - { backfill: true, limit? }→ embed all listings missing an embedding (admin/service role)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const EMBED_MODEL = "google/text-embedding-004"; // 768 dims

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Embedding API ${res.status}: ${t}`);
  }
  const json = await res.json();
  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("Invalid embedding response");
  return vec;
}

function buildListingText(l: any): string {
  return [
    `Title: ${l.property_title ?? ""}`,
    `Description: ${l.description ?? ""}`,
    `Price: ${l.asking_price ?? ""}`,
    `Features: ${JSON.stringify(l.features ?? [])}`,
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));

    // ---- backfill mode ----
    if (body.backfill === true) {
      const limit = Math.min(Number(body.limit) || 50, 200);
      const { data: rows, error } = await sb
        .from("listings")
        .select("id, property_title, description, asking_price, features")
        .is("embedding", null)
        .limit(limit);
      if (error) throw error;

      let ok = 0, failed = 0;
      for (const row of rows ?? []) {
        try {
          const vec = await embed(buildListingText(row));
          const { error: upErr } = await sb
            .from("listings")
            .update({ embedding: vec as any })
            .eq("id", row.id);
          if (upErr) throw upErr;
          ok++;
        } catch (e) {
          console.error("backfill failed", row.id, e);
          failed++;
        }
      }
      return new Response(JSON.stringify({ processed: rows?.length ?? 0, ok, failed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- listing mode ----
    if (body.listing_id) {
      const { data: listing, error } = await sb
        .from("listings")
        .select("id, property_title, description, asking_price, features")
        .eq("id", body.listing_id)
        .maybeSingle();
      if (error) throw error;
      if (!listing) throw new Error("Listing not found");

      const vec = await embed(buildListingText(listing));
      const { error: upErr } = await sb
        .from("listings")
        .update({ embedding: vec as any })
        .eq("id", listing.id);
      if (upErr) throw upErr;

      return new Response(JSON.stringify({ success: true, listing_id: listing.id, dims: vec.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- raw text mode ----
    if (typeof body.text === "string" && body.text.trim()) {
      const vec = await embed(body.text);
      return new Response(JSON.stringify({ embedding: vec, dims: vec.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Provide listing_id, text, or backfill:true" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-embedding error", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

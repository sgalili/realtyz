// Resolves a slug to its long URL, increments click counter. Public.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    let slug = "";
    if (req.method === "GET") {
      slug = new URL(req.url).searchParams.get("slug") || "";
    } else {
      const body = await req.json().catch(() => ({}));
      slug = (body as any).slug || "";
    }
    if (!slug) return json(400, { error: "slug required" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: row, error } = await admin
      .from("short_urls")
      .select("slug,long_url,property_id,clicks")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !row) return json(404, { error: "not_found" });

    // Fire-and-forget click increment
    admin
      .from("short_urls")
      .update({ clicks: (row.clicks ?? 0) + 1, last_click_at: new Date().toISOString() })
      .eq("slug", slug)
      .then(() => {});

    return json(200, { long_url: row.long_url, property_id: row.property_id });
  } catch (e) {
    return json(500, { error: String(e?.message ?? e) });
  }
});

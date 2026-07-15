// Owner profile enrichment (stub).
//
// Marks the crm_profiles row as `enriched_stub` with a best-effort skeleton
// of public social handles derived from the name. Real provider integration
// (Clearbit / PeopleDataLabs / etc.) can be plugged in here later without
// touching callers.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { owner_id } = await req.json().catch(() => ({}));
    if (!owner_id) return json({ error: "owner_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: profile, error } = await admin
      .from("crm_profiles")
      .select("id, full_name, phone, email, social_links, professional_info")
      .eq("id", owner_id)
      .maybeSingle();
    if (error || !profile) return json({ error: "not_found" }, 404);

    const name = String(profile.full_name || "").trim();
    const searchQ = encodeURIComponent(name);
    const social_links = {
      ...(profile.social_links as Record<string, unknown> || {}),
      linkedin_search: name ? `https://www.linkedin.com/search/results/people/?keywords=${searchQ}` : null,
      facebook_search: name ? `https://www.facebook.com/search/people/?q=${searchQ}` : null,
      google_search: name ? `https://www.google.com/search?q=${searchQ}` : null,
    };
    const professional_info = {
      ...(profile.professional_info as Record<string, unknown> || {}),
      enrichment_provider: "stub",
      enriched_at: new Date().toISOString(),
    };

    await admin.from("crm_profiles").update({
      social_links,
      professional_info,
      enrichment_status: "enriched_stub",
      enrichment_last_run_at: new Date().toISOString(),
    }).eq("id", owner_id);

    return json({ ok: true, owner_id });
  } catch (e) {
    console.error("[enrich-owner-profile] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});

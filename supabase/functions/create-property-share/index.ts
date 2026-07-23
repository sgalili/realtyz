// Mints a public share token for a property so the broker can WhatsApp-send
// a clean, single-property view to a lead. The token points at a row in
// `property_shares` — either linking to a local listings row (listing_id) or
// carrying an external_snapshot (Yad2/Webtiv/Homely) if the property isn't in
// the DB yet. The public view is served by `share-property-view`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "auth required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: uRes } = await userClient.auth.getUser();
    const uid = uRes?.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ error: "invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const listing_id: string | null = body?.listing_id ?? null;
    const external_snapshot = body?.external_snapshot ?? null;
    const lead_phone: string | null = body?.lead_phone ?? null;

    // Resolve broker profile for public label / WA button
    const { data: prof } = await admin
      .from("profiles")
      .select("full_name, phone")
      .eq("id", uid)
      .maybeSingle();

    const { data: wl } = await admin
      .from("white_label_settings")
      .select("agency_name")
      .eq("user_id", uid)
      .maybeSingle();

    const workspace_name = wl?.agency_name || prof?.full_name || "Realtyz";
    const broker_wa = prof?.phone ?? null;

    const token = crypto.randomUUID().replace(/-/g, "");

    const { data: inserted, error } = await admin
      .from("property_shares")
      .insert({
        token,
        owner_id: uid,
        listing_id,
        external_snapshot,
        workspace_name,
        broker_wa,
        lead_phone,
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
      })
      .select("token")
      .single();
    if (error) throw error;

    return new Response(JSON.stringify({ token: inserted.token }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

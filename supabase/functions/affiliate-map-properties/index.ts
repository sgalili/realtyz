import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = req.headers.get("Authorization") ?? "";
    const auth = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await auth.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(url, serviceKey);
    const { data: affiliate } = await admin.from("affiliate_profiles").select("user_id").eq("user_id", user.id).maybeSingle();
    if (!affiliate) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data, error } = await admin.rpc("get_affiliate_marketplace_v3");
    if (error) throw error;
    return new Response(JSON.stringify(data ?? []), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[affiliate-map-properties]", error);
    return new Response(JSON.stringify({ error: "marketplace lookup failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
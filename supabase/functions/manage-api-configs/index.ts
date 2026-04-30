import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const method = req.method;

    if (method === "GET") {
      const { data, error } = await supabase
        .from("api_configs")
        .select("*")
        .order("service_name");
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (method === "POST") {
      const body = await req.json();
      const { service_name, api_key, webhook_url, is_active } = body;

      // Check if exists
      const { data: existing } = await supabase
        .from("api_configs")
        .select("id")
        .eq("service_name", service_name)
        .maybeSingle();

      if (existing) {
        const payload: Record<string, unknown> = {
          api_key,
          updated_at: new Date().toISOString(),
          is_active: is_active ?? true,
        };
        if (webhook_url !== undefined) payload.webhook_url = webhook_url;
        const { error } = await supabase
          .from("api_configs")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("api_configs").insert({
          service_name,
          api_key,
          webhook_url: webhook_url || null,
          is_active: is_active ?? true,
        });
        if (error) throw error;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (method === "DELETE") {
      const { id } = await req.json();
      const { error } = await supabase
        .from("api_configs")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

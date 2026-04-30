import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user's API key with service role
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: keyRow, error: keyErr } = await admin
      .from("user_api_keys")
      .select("homely_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (keyErr || !keyRow?.homely_api_key) {
      return new Response(JSON.stringify({ error: "No Homely API key configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = keyRow.homely_api_key;

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const {
      path = "/",
      method = "GET",
      query = {},
      body: requestBody = null,
      baseUrl = "https://api.homely.com",
    } = body as {
      path?: string;
      method?: string;
      query?: Record<string, string>;
      body?: unknown;
      baseUrl?: string;
    };

    // Build target URL
    const url = new URL(path.startsWith("http") ? path : `${baseUrl}${path}`);
    Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, String(v)));

    // Proxy the request to Homely
    const upstream = await fetch(url.toString(), {
      method,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: requestBody && method !== "GET" ? JSON.stringify(requestBody) : undefined,
    });

    const contentType = upstream.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await upstream.json()
      : await upstream.text();

    return new Response(
      typeof payload === "string" ? payload : JSON.stringify(payload),
      {
        status: upstream.status,
        headers: {
          ...corsHeaders,
          "Content-Type": contentType.includes("json") ? "application/json" : "text/plain",
        },
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

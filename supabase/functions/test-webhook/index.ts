import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { webhook_url, payload, auth_token } = await req.json();

    if (!webhook_url) {
      return new Response(
        JSON.stringify({ error: "Missing webhook_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (auth_token) {
      headers["Authorization"] = `Bearer ${auth_token}`;
    }

    const res = await fetch(webhook_url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload || { type: "ping", source: "Realtyz AI", timestamp: new Date().toISOString() }),
    });

    const text = await res.text();
    console.log("Webhook response:", res.status, text);

    return new Response(
      JSON.stringify({ success: res.ok, status: res.status, body: text }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Test webhook error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

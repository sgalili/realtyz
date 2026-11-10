import { requireCaller, enforceRequestScope } from "../_shared/authz.ts";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const __caller = await requireCaller(req, ["service", "user"]);
  if (__caller instanceof Response) return __caller;
  const __scope = await enforceRequestScope(req, __caller);
  if (__scope) return __scope;

  try {
    const { webhook_url, auth_token } = await req.json();

    if (!webhook_url) {
      return new Response(
        JSON.stringify({ error: "Missing webhook_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Destination bounds: public HTTPS hosts only (no internal/private targets).
    let target: URL;
    try { target = new URL(String(webhook_url)); } catch { target = new URL("invalid:"); }
    const host = target.hostname.toLowerCase();
    const privateHost = host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".supabase.co") ||
      /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.includes(":") || /^\d+$/.test(host);
    if (target.protocol !== "https:" || !host.includes(".") || privateHost) {
      return new Response(JSON.stringify({ error: "invalid_webhook_url" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (auth_token) {
      headers["Authorization"] = `Bearer ${auth_token}`;
    }

    const res = await fetch(target.toString(), {
      method: "POST",
      headers,
      redirect: "manual",
      // Fixed ping body: callers can't choose arbitrary content.
      body: JSON.stringify({ type: "ping", source: "TORAFF", timestamp: new Date().toISOString() }),
    });

    const text = await res.text();
    console.log("Webhook response:", res.status, text);

    return new Response(
      JSON.stringify({ success: res.ok, status: res.status, body: text.slice(0, 500) }),
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

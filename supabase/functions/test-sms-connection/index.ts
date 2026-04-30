import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const user = body.user;
    const password = body.password || body.token;

    if (!user || !password) {
      return new Response(
        JSON.stringify({ error: "Missing user or password" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 019 SMS XML API - check balance to verify credentials
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<balance>
  <user>
    <username>${escapeXml(user)}</username>
    <password>${escapeXml(password)}</password>
  </user>
</balance>`;

    const res = await fetch("https://www.019sms.co.il:8090/api", {
      method: "POST",
      headers: { "Content-Type": "application/xml; charset=UTF-8" },
      body: xml,
    });

    const text = await res.text();
    console.log("019 SMS response:", res.status, text);

    const statusMatch = text.match(/<status>(\d+)<\/status>/);
    const balanceMatch = text.match(/<balance>(\d+)<\/balance>/);
    const messageMatch = text.match(/<message>(.*?)<\/message>/);
    const status = statusMatch ? parseInt(statusMatch[1]) : -1;

    if (status === 0 && balanceMatch) {
      return new Response(
        JSON.stringify({ success: true, credit: balanceMatch[1] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const errorMsg = messageMatch?.[1] || `Error code: ${status}`;
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Test SMS error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

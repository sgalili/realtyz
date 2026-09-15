import { corsHeaders } from "../_shared/cors.ts";

/**
 * Verifies 019 SMS credentials by reading the account balance.
 *
 * 019 no longer issues API passwords: the account owner generates an API TOKEN
 * on the 019 website, sent as `Authorization: Bearer <token>`. Legacy password
 * credentials still work and are used as a fallback.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const user = String(body.user ?? body.username ?? "").trim();
    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "").trim();

    if (!user || (!token && !password)) {
      return new Response(
        JSON.stringify({ error: "חסר שם משתמש או טוקן" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const attempt = async (useToken: boolean) => {
      const secret = useToken ? token : password;
      const headers: Record<string, string> = { "Content-Type": "application/xml; charset=UTF-8" };
      if (useToken) headers.Authorization = `Bearer ${secret}`;
      const userXml = useToken
        ? `<user><username>${escapeXml(user)}</username></user>`
        : `<user><username>${escapeXml(user)}</username><password>${escapeXml(secret)}</password></user>`;
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<balance>
  ${userXml}
</balance>`;
      const res = await fetch("https://www.019sms.co.il:8090/api", {
        method: "POST",
        headers,
        body: xml,
      });
      const text = await res.text();
      console.log("019 SMS response:", useToken ? "token" : "password", res.status, text);
      return {
        status: parseInt(text.match(/<status>(-?\d+)<\/status>/)?.[1] ?? "-1", 10),
        balance: text.match(/<balance>(\d+)<\/balance>/)?.[1] ?? null,
        message: text.match(/<message>(.*?)<\/message>/)?.[1] ?? null,
      };
    };

    let result = token ? await attempt(true) : await attempt(false);
    if (result.status !== 0 && token && password) result = await attempt(false);

    if (result.status === 0) {
      return new Response(
        JSON.stringify({ success: true, credit: result.balance ?? "0" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: result.message || `Error code: ${result.status}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Test SMS error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "שגיאה" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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

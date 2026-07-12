// Registers the workspace Ayrshare User Profile webhooks that power inbound
// Messenger/Instagram DMs and social comment sync into Realtyz.
import { createClient } from "npm:@supabase/supabase-js@2";
import { AYR_BASE, resolveWorkspaceProfileKey } from "../_shared/ayrshare-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const AYRSHARE_API_KEY = Deno.env.get("AYRSHARE_API_KEY")?.trim();
    if (!AYRSHARE_API_KEY) return json({ error: "AYRSHARE_API_KEY missing" }, 500);

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(auth.replace(/^Bearer\s+/i, ""));
    if (claimsError || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const { profileKey } = await resolveWorkspaceProfileKey(admin);
    if (!profileKey) return json({ error: "workspace_ayrshare_profile_not_linked" }, 400);

    const body = await req.json().catch(() => ({} as any));
    const webhookUrl = typeof body?.url === "string" && body.url.startsWith("https://")
      ? body.url
      : `${SUPABASE_URL}/functions/v1/ayrshare-webhook`;
    const actions = Array.isArray(body?.actions) && body.actions.length
      ? body.actions.map((a: unknown) => String(a || "").trim()).filter(Boolean)
      : ["messages", "comments", "social"];

    const results: Record<string, unknown> = {};
    for (const action of actions) {
      const res = await fetch(`${AYR_BASE}/hook/webhook`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, url: webhookUrl }),
      });
      const text = await res.text();
      let payload: unknown = text;
      try { payload = text ? JSON.parse(text) : {}; } catch { /* keep text */ }
      results[action] = { ok: res.ok, status: res.status, response: payload };
    }

    await admin.from("campaign_settings").upsert(
      {
        key: "ayrshare_webhook_registration",
        value: JSON.stringify({ webhookUrl, actions, results, updated_at: new Date().toISOString() }),
      },
      { onConflict: "key" },
    );

    return json({ ok: true, webhookUrl, results });
  } catch (e) {
    console.error("[ayrshare-register-webhook]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
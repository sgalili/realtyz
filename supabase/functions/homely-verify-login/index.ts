// Verify a broker's stored Homely (Webtiv) login by calling the real endpoint:
//   POST https://webtivapi.webtiv.co.il/api/login/LoginNewByAgent
// Body: { client, username, password, theme, version, deviceInfo }
// Success heuristic: HTTP 200 AND response.db != 0 (the web client treats db==0 as bad credentials).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const HOMELY_LOGIN_URL = "https://webtivapi.webtiv.co.il/api/login/LoginNewByAgent";

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function attemptHomelyLogin(agency: string, username: string, password: string): Promise<{
  ok: boolean;
  status: number;
  note: string;
}> {
  try {
    const res = await fetch(HOMELY_LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        client: agency,
        username,
        password,
        theme: "",
        version: "realtyz-1.0",
        deviceInfo: {
          DeviceType: "server",
          UserAgent: "Realtyz/1.0 (+https://realtyz.udiman.com)",
          Os: "deno",
          Platform: "edge-function",
        },
      }),
    });
    let data: any = null;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { /* not json */ }
    if (!res.ok) return { ok: false, status: res.status, note: text.slice(0, 200) || "http_error" };
    // db == 0 means "wrong username or password" per the web client
    if (data && (data.db === 0 || data.db === "0")) {
      return { ok: false, status: 401, note: "invalid_credentials" };
    }
    return { ok: true, status: 200, note: "ok" };
  } catch (e) {
    return { ok: false, status: 0, note: `network_error:${(e as Error).message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const targetUserId = (body as any)?.user_id || user.id;

    // Only admin can verify someone else's
    if (targetUserId !== user.id) {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
      const isAdmin = (roles || []).some((r: any) => ["admin", "super_admin"].includes(r.role));
      if (!isAdmin) return json({ error: "Forbidden" }, 403);
    }

    // Decrypt password via RPC
    const { data: pw, error: pwErr } = await admin.rpc("get_homely_password", { _user_id: targetUserId });
    if (pwErr) return json({ error: pwErr.message }, 500);

    const { data: row } = await admin
      .from("homely_broker_credentials")
      .select("homely_username, homely_agency")
      .eq("user_id", targetUserId)
      .maybeSingle();
    const username = (row as any)?.homely_username;
    const agency = (row as any)?.homely_agency;

    if (!username || !pw || !agency) {
      await admin.from("homely_broker_credentials").upsert({
        user_id: targetUserId,
        connection_status: "not_configured",
        last_error: "missing_credentials (need agency + username + password)",
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id" });
      return json({ ok: false, status: "not_configured", note: "missing agency/username/password" });
    }

    const result = await attemptHomelyLogin(String(agency), String(username), pw as unknown as string);
    const status = result.ok ? "ok" : "failed";

    await admin.from("homely_broker_credentials").upsert({
      user_id: targetUserId,
      connection_status: status,
      last_verified_at: new Date().toISOString(),
      last_error: result.ok ? null : `HTTP ${result.status}: ${result.note}`,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "user_id" });

    if (!result.ok) {
      await logIntegrationError({
        integration: "homely",
        functionName: "homely-verify-login",
        errorCode: result.status,
        errorMessage: result.note,
        context: { user_id: targetUserId },
      });
    }
    return json({ ok: result.ok, status, note: result.note });
  } catch (e) {
    console.error("[homely-verify-login] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});

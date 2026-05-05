// Verify a broker's stored Homely username/password.
// Until you provide the real Homely login URL, this performs a "manual" check:
// it confirms credentials are stored + decryptable, marks the connection as
// `manually_verified`, and stamps `last_verified_at`. Once the real endpoint
// is provided, replace `attemptHomelyLogin()` with a real fetch.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function attemptHomelyLogin(_username: string, _password: string): Promise<{
  ok: boolean;
  status: number;
  note: string;
}> {
  // TODO: replace with real Homely login URL once provided.
  // Example shape once we have it:
  //   const res = await fetch("https://crm.homely.co.il/api/login", {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify({ username, password }),
  //   });
  //   return { ok: res.ok, status: res.status, note: res.ok ? "ok" : await res.text() };
  return { ok: true, status: 200, note: "credentials_stored_pending_real_endpoint" };
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
      .select("homely_username")
      .eq("user_id", targetUserId)
      .maybeSingle();
    const username = (row as any)?.homely_username;

    if (!username || !pw) {
      await admin.from("homely_broker_credentials").upsert({
        user_id: targetUserId,
        connection_status: "not_configured",
        last_error: "missing_credentials",
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id" });
      return json({ ok: false, status: "not_configured" });
    }

    const result = await attemptHomelyLogin(username, pw as unknown as string);
    const status = result.ok
      ? (result.note === "credentials_stored_pending_real_endpoint" ? "manually_verified" : "ok")
      : "failed";

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

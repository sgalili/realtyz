// Verify a broker's Homely/Webtiv connection.
//
// Primary check (per Webtiv OpenCardApi docs):
//   POST https://webtivapi.webtiv.co.il/api/WebtivLid/WebtivLidPost
//   Body: { client, provider:"RealtyZ", category:"מוכר", remark:"בדיקת תקינות ממשק RealtyZ" }
// A 2xx response means the agency code (client) is valid and Homely
// accepted a lead from the RealtyZ provider — i.e. the OpenCard pipeline
// is wired correctly end-to-end.
//
// Secondary check (only when username+password are stored): legacy
// LoginNewByAgent probe so the saved broker-login still passes. The
// connection_status surfaced to the UI is OK iff OpenCard accepted us.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const HOMELY_LOGIN_URL = "https://webtivapi.webtiv.co.il/api/login/LoginNewByAgent";
const OPENCARD_URL = "https://webtivapi.webtiv.co.il/api/WebtivLid/WebtivLidPost";

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function attemptOpenCard(agency: string): Promise<{ ok: boolean; status: number; note: string; }> {
  try {
    const res = await fetch(OPENCARD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        client: agency,
        provider: "RealtyZ",
        category: "מוכר",
        remark: "בדיקת תקינות ממשק RealtyZ",
      }),
    });
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* not json */ }
    if (!res.ok) {
      return { ok: false, status: res.status, note: text.slice(0, 300) || `http_${res.status}` };
    }
    // Webtiv returns 200 even for invalid clients. Authoritative signal is
    // the body: `{ success: true, serial: <positive int> }` on success;
    // `{ success: false, errorMessage: "לקוח לא קיים", serial: -1 }` on
    // bad agency code.
    if (data && typeof data === "object") {
      const success = data.success === true || data.success === "true";
      const serial = Number(data.serial);
      if (!success || !Number.isFinite(serial) || serial <= 0) {
        const reason = String(data.errorMessage || data.message || "לקוח לא קיים");
        return { ok: false, status: 401, note: reason };
      }
      return { ok: true, status: 200, note: `serial:${serial}` };
    }
    // Non-JSON 200 — treat as a soft success (some Webtiv installs return plain text).
    return { ok: true, status: res.status, note: text.slice(0, 200) || "ok" };
  } catch (e) {
    return { ok: false, status: 0, note: `network_error:${(e as Error).message}` };
  }
}


async function attemptHomelyLogin(agency: string, username: string, password: string): Promise<{ ok: boolean; status: number; note: string; }> {
  try {
    const res = await fetch(HOMELY_LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        client: agency,
        username,
        password,
        theme: "",
        version: "realtyz-1.0",
        deviceInfo: { DeviceType: "server", UserAgent: "Realtyz/1.0 (+https://realtyz.udiman.com)", Os: "deno", Platform: "edge-function" },
      }),
    });
    let data: any = null;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { /* not json */ }
    if (!res.ok) return { ok: false, status: res.status, note: text.slice(0, 200) || "http_error" };
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

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const targetUserId = (body as any)?.user_id || user.id;

    if (targetUserId !== user.id) {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
      const isAdmin = (roles || []).some((r: any) => ["admin", "super_admin"].includes(r.role));
      if (!isAdmin) return json({ error: "Forbidden" }, 403);
    }

    const { data: row } = await admin
      .from("homely_broker_credentials")
      .select("homely_username, homely_agency")
      .eq("user_id", targetUserId)
      .maybeSingle();
    const username = (row as any)?.homely_username || null;
    const agency = (row as any)?.homely_agency || null;

    if (!agency) {
      await admin.from("homely_broker_credentials").upsert({
        user_id: targetUserId,
        connection_status: "not_configured",
        last_error: "missing_agency_code",
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id" });
      return json({ ok: false, status: "not_configured", note: "missing_agency_code" }, 200);
    }

    // 1) Primary: OpenCard WebtivLidPost.
    const opencard = await attemptOpenCard(String(agency));

    // 2) Optional secondary login probe (only if creds saved).
    let login: { ok: boolean; status: number; note: string } | null = null;
    if (opencard.ok && username) {
      const { data: pw } = await admin.rpc("get_homely_password", { _user_id: targetUserId });
      if (pw) login = await attemptHomelyLogin(String(agency), String(username), pw as unknown as string);
    }

    const status = opencard.ok ? "ok" : "failed";

    await admin.from("homely_broker_credentials").upsert({
      user_id: targetUserId,
      connection_status: status,
      last_verified_at: new Date().toISOString(),
      last_error: opencard.ok ? null : `HTTP ${opencard.status}: ${opencard.note}`,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "user_id" });

    if (!opencard.ok) {
      await logIntegrationError({
        integration: "homely",
        functionName: "homely-verify-login",
        errorCode: opencard.status,
        errorMessage: opencard.note,
        context: { user_id: targetUserId, endpoint: "WebtivLidPost" },
      });
    }

    return json({
      ok: opencard.ok,
      status,
      note: opencard.note,
      opencard,
      login,
    });
  } catch (e) {
    console.error("[homely-verify-login] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});

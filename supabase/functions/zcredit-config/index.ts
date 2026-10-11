import { corsHeaders } from "../_shared/cors.ts";
import { admin, getCaller, isSuperAdmin } from "../_shared/zcredit.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { user } = await getCaller(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!(await isSuperAdmin(user.id))) return json({ error: "forbidden" }, 403);
  const db = admin();
  const { data: row } = await db.from("api_configs").select("id,api_key,is_active,updated_at").eq("service_name", "zcredit").maybeSingle();
  let cur: any = {};
  try { cur = row?.api_key ? JSON.parse(row.api_key) : {}; } catch { /* ignore */ }

  if (req.method === "GET") {
    return json({
      configured: !!(cur.terminal_id && cur.api_key),
      terminal_id: cur.terminal_id ?? "",
      api_key_last4: cur.api_key ? String(cur.api_key).slice(-4) : null,
      environment: cur.environment ?? "sandbox",
      is_active: row?.is_active ?? false,
      updated_at: row?.updated_at ?? null,
    });
  }
  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const terminal_id = String(b.terminal_id ?? "").trim().slice(0, 64);
    const api_key = b.api_key ? String(b.api_key).trim().slice(0, 512) : cur.api_key;
    const environment = b.environment === "production" ? "production" : "sandbox";
    if (!terminal_id || !api_key) return json({ error: "נדרשים מספר מסוף ומפתח API" }, 400);
    const payload = { api_key: JSON.stringify({ terminal_id, api_key, environment }), is_active: b.is_active !== false, updated_at: new Date().toISOString() };
    const r = row
      ? await db.from("api_configs").update(payload).eq("id", row.id)
      : await db.from("api_configs").insert({ service_name: "zcredit", ...payload });
    if (r.error) return json({ error: r.error.message }, 500);
    await db.from("audit_logs").insert({ user_id: user.id, action: "zcredit_config_updated", details: { environment, terminal_id } } as any).then(() => {}, () => {});
    return json({ ok: true });
  }
  return json({ error: "method" }, 405);
});

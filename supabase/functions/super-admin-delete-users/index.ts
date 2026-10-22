// Super Admin only: permanently deletes accounts matched by Israeli phone numbers,
// purging their public data and then the login account itself.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({ phones: z.array(z.string().min(9).max(20)).min(1).max(50), dry_run: z.boolean().default(false) });
const tail9 = (v: string) => { const d = v.replace(/\D/g, ""); return d.length >= 9 ? d.slice(-9) : ""; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "unauthorized" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
    if (!(roles ?? []).some((r) => r.role === "super_admin")) return json({ error: "forbidden" }, 403);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const wanted = new Set(parsed.data.phones.map(tail9).filter(Boolean));

    const matches: { id: string; phone: string }[] = [];
    for (let page = 1; page < 100; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      for (const u of data.users) {
        const cands = [u.phone ?? "", u.email ?? "", String(u.user_metadata?.phone ?? ""), String(u.user_metadata?.phone_number ?? "")];
        const hit = cands.map(tail9).find((t) => t && wanted.has(t));
        if (hit) matches.push({ id: u.id, phone: hit });
      }
      if (data.users.length < 1000) break;
    }

    const results: { phone: string; status: string; rows?: number }[] = [];
    for (const m of matches) {
      if (m.id === caller.id) { results.push({ phone: m.phone, status: "skipped_self" }); continue; }
      const { data: r } = await admin.from("user_roles").select("role").eq("user_id", m.id);
      if ((r ?? []).some((x) => x.role === "super_admin")) { results.push({ phone: m.phone, status: "skipped_super_admin" }); continue; }
      if (parsed.data.dry_run) { results.push({ phone: m.phone, status: "found" }); continue; }
      const { data: rows, error: pErr } = await admin.rpc("admin_purge_user_data", { _uid: m.id });
      if (pErr) { results.push({ phone: m.phone, status: "purge_failed" }); continue; }
      const { error: dErr } = await admin.auth.admin.deleteUser(m.id);
      results.push({ phone: m.phone, status: dErr ? "delete_failed" : "deleted", rows: rows as number });
    }
    for (const p of wanted) if (!matches.some((m) => m.phone === p)) results.push({ phone: p, status: "not_found" });

    await admin.from("audit_logs").insert({ user_id: caller.id, action: "super_admin_delete_users", details: { results } } as never).then(() => {}, () => {});
    return json({ ok: true, results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "server_error" }, 500);
  }
});

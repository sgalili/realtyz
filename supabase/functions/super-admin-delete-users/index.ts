// Super Admin only: permanently deletes accounts matched by Israeli phone numbers,
// purging their public data and then the login account itself.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";
import { userDeletionProtection } from '../_shared/userDeletionPolicy.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({ phones: z.array(z.string().min(9).max(20)).max(50).default([]), user_ids: z.array(z.string().uuid()).max(50).default([]), dry_run: z.boolean().default(false) }).refine(b => (b.phones.length > 0) !== (b.user_ids.length > 0));
const tail9 = (v: string) => { const d = v.replace(/\D/g, ""); return d.length >= 9 ? d.slice(-9) : ""; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) throw new Error("configuration_missing");
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "unauthorized" }, 401);
    const admin = createClient(url, serviceKey);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
    if (!(roles ?? []).some((r) => r.role === "super_admin")) return json({ error: "forbidden" }, 403);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const wanted = new Set(parsed.data.phones.map(tail9).filter(Boolean));

    const matches: { id: string; phone: string }[] = [];
    for (const id of new Set(parsed.data.user_ids)) {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data.user) continue;
      matches.push({ id, phone: tail9(data.user.phone ?? "") });
    }
    for (let page = 1; wanted.size > 0 && page < 100; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      for (const u of data.users) {
        const cands = [u.phone ?? "", u.email ?? "", String(u.user_metadata?.phone ?? ""), String(u.user_metadata?.phone_number ?? "")];
        const hit = cands.map(tail9).find((t) => t && wanted.has(t));
        if (hit) matches.push({ id: u.id, phone: hit });
      }
      if (data.users.length < 1000) break;
    }

    const results: { user_id?: string; phone: string; status: string; rows?: number }[] = [];
    for (const m of matches) {
      const { data: r, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", m.id);
      if (roleError) throw roleError;
      const protection = userDeletionProtection(caller.id, m.id, (r ?? []).map(x => x.role));
      if (protection) { results.push({ user_id: m.id, phone: m.phone, status: protection }); continue; }
      if (parsed.data.dry_run) { results.push({ user_id: m.id, phone: m.phone, status: "found" }); continue; }
      // Remove owned files through Storage API before Auth deletion (never direct storage writes).
      let storageFailed = false;
      while (true) {
        const { data: files, error: filesError } = await admin.rpc("account_owned_files", { _uid: m.id });
        if (filesError) { storageFailed = true; break; }
        if (!files?.length) break;
        for (const bucket of new Set(files.map(f => f.bucket_id))) {
          const { error } = await admin.storage.from(bucket).remove(files.filter(f => f.bucket_id === bucket).map(f => f.name));
          if (error) { storageFailed = true; break; }
        }
        if (storageFailed) break;
      }
      if (storageFailed) { results.push({ user_id: m.id, phone: m.phone, status: "storage_failed" }); continue; }
      const { data: rows, error: pErr } = await admin.rpc("admin_purge_user_data", { _uid: m.id });
      if (pErr) { results.push({ user_id: m.id, phone: m.phone, status: "purge_failed" }); continue; }
      const { error: dErr } = await admin.auth.admin.deleteUser(m.id);
      results.push({ user_id: m.id, phone: m.phone, status: dErr ? "delete_failed" : "deleted", rows: rows as number });
    }
    for (const id of new Set(parsed.data.user_ids)) if (!matches.some(m => m.id === id)) results.push({ user_id: id, phone: "", status: "not_found" });
    for (const p of wanted) if (!matches.some((m) => m.phone === p)) results.push({ phone: p, status: "not_found" });

    await admin.from("audit_logs").insert({ user_id: caller.id, action: "super_admin_delete_users", details: { results } } as never).then(() => {}, () => {});
    return json({ ok: true, results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "server_error" }, 500);
  }
});

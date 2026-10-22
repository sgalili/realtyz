// Self-service permanent account deletion. A code is sent by WhatsApp (official
// number) and email; confirming it archives a minimal record for Super Admin
// reference, purges the user's data and deletes the login account.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Body = z.object({ action: z.enum(["send", "confirm"]), code: z.string().regex(/^\d{4,6}$/).optional() });
const TTL_MIN = 10;
const hash = async (uid: string, code: string) => {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`del:${uid}:${code}:${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
};
const isReal = (e?: string | null) => !!e && /@/.test(e) && !/\.(invalid|local|test)$/i.test(e);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: "unauthorized" }, 401);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: "invalid_request" }, 400);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const roleList = (roles ?? []).map((r) => String(r.role));
    if (roleList.includes("super_admin")) return json({ error: "super_admin_cannot_self_delete" }, 403);
    const phone = String(user.phone || user.user_metadata?.phone || "").replace(/\D/g, "");

    if (parsed.data.action === "send") {
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, "0");
      await admin.from("account_deletion_otps").upsert({ user_id: user.id, code_hash: await hash(user.id, code), expires_at: new Date(Date.now() + TTL_MIN * 60_000).toISOString(), attempts: 0 });
      const text = `קוד לאישור מחיקת החשבון ב-TORAFF: ${code}. המחיקה סופית ולא ניתנת לביטול.`;
      const sent: string[] = [];
      if (phone.length >= 9) {
        const r = await fetch(`${url}/functions/v1/send-whatsapp`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key }, body: JSON.stringify({ phone_number: phone, force_official: true, message: text }) }).catch(() => null);
        if (r?.ok) sent.push("whatsapp");
      }
      if (isReal(user.email)) {
        const r = await fetch("https://connector-gateway.lovable.dev/resend/emails", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY") ?? ""}`, "X-Connection-Api-Key": Deno.env.get("RESEND_API_KEY") ?? "" }, body: JSON.stringify({ from: "TORAFF <info@realtyz.co.il>", to: [user.email], subject: "אישור מחיקת חשבון TORAFF", text }) }).catch(() => null);
        if (r?.ok) sent.push("email");
      }
      if (!sent.length) return json({ error: "send_failed" }, 502);
      return json({ ok: true, sent });
    }

    const { data: otp } = await admin.from("account_deletion_otps").select("*").eq("user_id", user.id).maybeSingle();
    if (!otp || new Date(otp.expires_at).getTime() < Date.now() || otp.attempts >= 5) return json({ error: "code_expired" }, 400);
    if (!parsed.data.code || otp.code_hash !== await hash(user.id, parsed.data.code)) {
      await admin.from("account_deletion_otps").update({ attempts: otp.attempts + 1 }).eq("user_id", user.id);
      return json({ error: "wrong_code" }, 400);
    }
    const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
    const { error: aErr } = await admin.from("deleted_accounts_archive").insert({ user_id: user.id, phone: phone || null, email: user.email ?? null, full_name: (profile as any)?.full_name ?? null, roles: roleList, profile: profile ?? null });
    if (aErr) throw aErr;
    const { error: pErr } = await admin.rpc("admin_purge_user_data", { _uid: user.id });
    if (pErr) throw pErr;
    await admin.from("account_deletion_otps").delete().eq("user_id", user.id);
    const { error: dErr } = await admin.auth.admin.deleteUser(user.id);
    if (dErr) throw dErr;
    return json({ ok: true });
  } catch (e) {
    console.error("account-self-delete", e);
    return json({ error: "server_error" }, 500);
  }
});

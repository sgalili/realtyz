// Self-service permanent account deletion. A code is sent by WhatsApp (official
// number) and email; confirming it archives a minimal record for Super Admin
// reference, purges the user's data and deletes the login account.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Body = z.object({ action: z.enum(["send", "confirm"]), code: z.string().regex(/^\d{6}$/).optional() });
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
    const { data: profile } = await admin.from("profiles").select("phone,email").eq("id", user.id).maybeSingle();
    const rawPhone = String(user.phone || profile?.phone || user.user_metadata?.phone || "").replace(/\D/g, "");
    const phone = rawPhone.startsWith("0") ? `972${rawPhone.slice(1)}` : rawPhone;
    const email = isReal(user.email) ? user.email : isReal(profile?.email) ? profile?.email : null;

    if (parsed.data.action === "send") {
      const { data: previous } = await admin.from("account_deletion_otps").select("created_at").eq("user_id", user.id).maybeSingle();
      if (previous && Date.now() - new Date(previous.created_at).getTime() < 60_000) return json({ error: "rate_limited" }, 429);
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
      const { error: saveError } = await admin.from("account_deletion_otps").upsert({ user_id: user.id, code_hash: await hash(user.id, code), expires_at: new Date(Date.now() + TTL_MIN * 60_000).toISOString(), attempts: 0, created_at: new Date().toISOString() });
      if (saveError) throw saveError;
      const text = `קוד לאישור מחיקת החשבון ב-TORAFF: ${code}. המחיקה סופית ולא ניתנת לביטול.`;
      const sent: string[] = [];
      if (phone.length >= 9) {
        const { data: templates } = await admin.from("wa_message_templates").select("name,language").eq("category", "AUTHENTICATION").eq("status", "APPROVED").order("synced_at", { ascending: false }).limit(1);
        const template = templates?.[0];
        const payload = template ? {
          phone_number: phone, force_official: true, template_id: template.name, template_language: template.language,
          template_components: [{ type: "body", parameters: [{ type: "text", text: code }] }, { type: "button", sub_type: "copy_code", index: "0", parameters: [{ type: "coupon_code", coupon_code: code }] }],
        } : { phone_number: phone, force_official: true, message: text };
        const r = await fetch(`${url}/functions/v1/send-whatsapp`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000) }).catch(() => null);
        const out = await r?.json().catch(() => null);
        if (r?.ok && out?.success === true) sent.push("whatsapp");
      }
      if (email) {
        const { data, error } = await admin.functions.invoke("send-transactional-email", { body: { templateName: "account-deletion-otp", recipientEmail: email, idempotencyKey: `account-deletion-${user.id}-${crypto.randomUUID()}`, templateData: { code } } });
        if (!error && data?.success === true) sent.push("email");
      }
      if (!sent.length) return json({ error: "send_failed" }, 502);
      return json({ ok: true, sent });
    }

    if (!parsed.data.code) return json({ error: "wrong_code" }, 400);
    const { data: prepared, error: prepareError } = await admin.rpc("prepare_account_self_deletion", { _uid: user.id, _code_hash: await hash(user.id, parsed.data.code), _phone: phone || null, _email: email });
    if (prepareError) throw prepareError;
    if (prepared?.error) return json({ error: prepared.error }, 400);
    const { error: dErr } = await admin.auth.admin.deleteUser(user.id);
    if (dErr) throw dErr;
    const { error: archiveError } = await admin.from("deleted_accounts_archive").update({ reason: "self_request" }).eq("user_id", user.id).eq("reason", "self_request_pending");
    if (archiveError) console.error("account-self-delete archive finalization failed");
    await admin.from("account_deletion_otps").delete().eq("user_id", user.id);
    return json({ ok: true });
  } catch (e) {
    console.error("account-self-delete", e);
    return json({ error: "server_error" }, 500);
  }
});

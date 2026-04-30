import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeIsraeliPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (/^05\d{8}$/.test(digits)) return `972${digits.slice(1)}`;
  if (/^9725\d{8}$/.test(digits)) return digits;
  return null;
};

const hashCode = async (phone: string, code: string) => {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "kalpiz-auth";
  const data = new TextEncoder().encode(`${phone}:${code}:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const action = String(body.action ?? "send");
    const phone = normalizeIsraeliPhone(String(body.phone ?? ""));
    if (!phone) return json({ error: "מספר WhatsApp לא תקין" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    if (action === "send") {
      await admin.rpc("cleanup_expired_whatsapp_login_otps");

      // Resolve Green API credentials from either api_configs (legacy "instanceId:token") or social_connections JSON.
      let instanceId = "";
      let token = "";
      const { data: legacyConfig } = await admin
        .from("api_configs")
        .select("api_key")
        .eq("service_name", "Green API")
        .eq("is_active", true)
        .maybeSingle();
      if (legacyConfig?.api_key) {
        const [id, ...rest] = String(legacyConfig.api_key).split(":");
        instanceId = id ?? "";
        token = rest.join(":");
      }
      if (!instanceId || !token) {
        const { data: socialRow } = await admin
          .from("social_connections")
          .select("credentials")
          .eq("platform", "whatsapp_green")
          .eq("is_connected", true)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const creds = (socialRow?.credentials ?? {}) as { instance_id?: string; token?: string; api_token?: string };
        instanceId = instanceId || String(creds.instance_id ?? "");
        token = token || String(creds.api_token ?? creds.token ?? "");
      }
      if (!instanceId || !token) return json({ error: "Green API לא מוגדר" }, 500);

      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, "0");
      const codeHash = await hashCode(phone, code);
      const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

      const sendResponse = await fetch(`https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: `${phone}@c.us`,
          message: `קוד האימות שלך ל-Kalpiz: ${code}`,
        }),
      });

      if (!sendResponse.ok) {
        const details = await sendResponse.text();
        console.error("Green API send failed", sendResponse.status, details);
        return json({ error: "שליחת קוד WhatsApp נכשלה" }, 502);
      }

      // Confirm GreenAPI accepted the message (idMessage present) before persisting OTP.
      let sendPayload: { idMessage?: string } = {};
      try { sendPayload = await sendResponse.json(); } catch { sendPayload = {}; }
      if (!sendPayload?.idMessage) {
        console.error("Green API send returned no idMessage", sendPayload);
        return json({ error: "שליחת קוד WhatsApp נכשלה" }, 502);
      }

      const { error: insertError } = await admin.from("whatsapp_login_otps").insert({
        phone_number: phone,
        code_hash: codeHash,
        expires_at: expiresAt,
      });
      if (insertError) throw insertError;

      return json({ success: true });
    }

    if (action === "verify") {
      const code = String(body.code ?? "").replace(/\D/g, "");
      if (!/^\d{4}$/.test(code)) return json({ error: "קוד אימות לא תקין" }, 400);

      const { data: otpRow, error: otpError } = await admin
        .from("whatsapp_login_otps")
        .select("id, code_hash, attempts, expires_at, consumed_at")
        .eq("phone_number", phone)
        .is("consumed_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (otpError) throw otpError;
      if (!otpRow || otpRow.attempts >= MAX_ATTEMPTS) return json({ error: "הקוד פג או לא נמצא" }, 400);

      const expectedHash = await hashCode(phone, code);
      if (expectedHash !== otpRow.code_hash) {
        await admin.from("whatsapp_login_otps").update({ attempts: otpRow.attempts + 1 }).eq("id", otpRow.id);
        return json({ error: "קוד שגוי" }, 400);
      }

      await admin.from("whatsapp_login_otps").update({ consumed_at: new Date().toISOString() }).eq("id", otpRow.id);

      // Try to find an existing user already linked to this phone number (covers merged accounts).
      let targetEmail: string | null = null;
      try {
        const { data: byPhone } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const match = byPhone?.users?.find((u) => {
          const userPhone = String(u.phone ?? "").replace(/\D/g, "");
          const metaPhone = String((u.user_metadata as { phone_number?: string } | null)?.phone_number ?? "").replace(/\D/g, "");
          return userPhone === phone || metaPhone === phone;
        });
        if (match?.email) targetEmail = match.email;
      } catch (lookupErr) {
        console.warn("whatsapp-auth: phone lookup failed, falling back to synthetic email", lookupErr);
      }

      // Fallback: legacy synthetic email account (created on-demand for first-time WA-only logins).
      if (!targetEmail) {
        const syntheticEmail = `${phone}@whatsapp.kalpiz.local`;
        const { error: createError } = await admin.auth.admin.createUser({
          email: syntheticEmail,
          phone: `+${phone}`,
          email_confirm: true,
          phone_confirm: true,
          user_metadata: { provider: "whatsapp_green", phone_number: phone },
        });
        if (createError && !/already|registered|exists/i.test(createError.message)) throw createError;
        targetEmail = syntheticEmail;
      }

      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: targetEmail,
      });
      if (linkError) throw linkError;

      return json({
        success: true,
        email: targetEmail,
        token_hash: linkData.properties?.hashed_token,
      });
    }

    return json({ error: "פעולה לא נתמכת" }, 400);
  } catch (error) {
    console.error("whatsapp-auth error", error);
    return json({ error: error instanceof Error ? error.message : "שגיאת שרת" }, 500);
  }
});

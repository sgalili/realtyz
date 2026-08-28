import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

const safeErrorDetails = (error: unknown) => ({
  name: error instanceof Error ? error.name : typeof error,
  message: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack?.slice(0, 4000) : undefined,
});

const envPresence = () => ({
  has_meta_wa_otp_template_name: !!Deno.env.get("META_WA_OTP_TEMPLATE_NAME"),
  has_whatsapp_otp_template_name: !!Deno.env.get("WHATSAPP_OTP_TEMPLATE_NAME"),
  meta_wa_otp_template_language: Deno.env.get("META_WA_OTP_TEMPLATE_LANGUAGE") ?? null,
  whatsapp_otp_template_language: Deno.env.get("WHATSAPP_OTP_TEMPLATE_LANGUAGE") ?? null,
  has_meta_wa_access_token: !!Deno.env.get("META_WA_ACCESS_TOKEN"),
  has_meta_whatsapp_token: !!Deno.env.get("META_WHATSAPP_TOKEN"),
  has_meta_wa_phone_number_id: !!Deno.env.get("META_WA_PHONE_NUMBER_ID"),
  has_meta_phone_number_id: !!Deno.env.get("META_PHONE_NUMBER_ID"),
});

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
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "realtyz-auth";
  const data = new TextEncoder().encode(`${phone}:${code}:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

/**
 * Resolves the Meta template used to deliver the login code.
 * Order: explicit env override -> synced APPROVED AUTHENTICATION template ->
 * null (free-text fallback, only valid inside an open 24h window).
 */
const resolveOtpTemplate = async (admin: any, code: string) => {
  let name = Deno.env.get("META_WA_OTP_TEMPLATE_NAME") ?? Deno.env.get("WHATSAPP_OTP_TEMPLATE_NAME") ?? "";
  let language = Deno.env.get("META_WA_OTP_TEMPLATE_LANGUAGE") ?? Deno.env.get("WHATSAPP_OTP_TEMPLATE_LANGUAGE") ?? "";
  let copyCode = (Deno.env.get("META_WA_OTP_COPY_CODE_BUTTON") ?? "").toLowerCase() === "true";

  if (!name) {
    const { data } = await admin
      .from("wa_message_templates")
      .select("name, language, category, status")
      .eq("category", "AUTHENTICATION")
      .eq("status", "APPROVED")
      .order("synced_at", { ascending: false })
      .limit(1);
    const row = (data ?? [])[0] as { name?: string; language?: string } | undefined;
    if (row?.name) {
      name = row.name;
      language = language || String(row.language ?? "he");
      // Meta AUTHENTICATION templates always carry a copy-code button.
      copyCode = true;
    }
  }

  if (!name) return null;

  const components: unknown[] = [
    { type: "body", parameters: [{ type: "text", text: code }] },
  ];
  if (copyCode) {
    components.push({
      type: "button",
      sub_type: "copy_code",
      index: "0",
      parameters: [{ type: "coupon_code", coupon_code: code }],
    });
  }
  return { name, language: language || "he", components };
};


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (error) {
      console.error("whatsapp-auth invalid JSON body", safeErrorDetails(error));
      return json({ error: "Invalid JSON body" }, 400);
    }
    const action = String(body.action ?? "send");
    const phone = normalizeIsraeliPhone(String(body.phone ?? ""));
    if (!phone) {
      console.warn("whatsapp-auth rejected invalid phone", { action });
      return json({ error: "מספר WhatsApp לא תקין" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("whatsapp-auth missing backend env", {
        has_supabase_url: !!supabaseUrl,
        has_service_role_key: !!serviceRoleKey,
        env: envPresence(),
      });
      return json({ error: "Backend environment is not configured" }, 500);
    }
    const admin = createClient(supabaseUrl, serviceRoleKey);

    if (action === "send") {
      console.info("whatsapp-auth OTP send requested", { phone_last4: phone.slice(-4), env: envPresence() });
      await admin.rpc("cleanup_expired_whatsapp_login_otps");
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, "0");
      const codeHash = await hashCode(phone, code);
      const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

      const template = otpTemplate(code);
      const payload: Record<string, unknown> = template
        ? {
            phone_number: phone,
            template_id: template.name,
            template_language: template.language,
            template_components: template.components,
          }
        : {
            phone_number: phone,
            message: `קוד האימות שלך ל-Realtyz: ${code}`,
          };

      let sendResponse: Response;
      let sendPayload: any = {};
      try {
        sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
          },
          body: JSON.stringify(payload),
        });
        sendPayload = await sendResponse.json().catch(() => ({}));
      } catch (error) {
        console.error("whatsapp-auth internal send-whatsapp request threw", {
          phone_last4: phone.slice(-4),
          template: template?.name ?? null,
          error: safeErrorDetails(error),
          env: envPresence(),
        });
        await logIntegrationError({
          integration: "whatsapp",
          functionName: "whatsapp-auth",
          errorMessage: error instanceof Error ? error.message : "send-whatsapp network request failed",
          context: { phone_last4: phone.slice(-4), template: template?.name ?? null, error: safeErrorDetails(error), env: envPresence() },
        });
        return json({ error: error instanceof Error ? error.message : "שליחת קוד האימות נכשלה" }, 502);
      }
      if (!sendResponse.ok || sendPayload?.success === false || !sendPayload?.message_id) {
        console.error("whatsapp-auth OTP send failed", {
          status: sendResponse.status,
          phone_last4: phone.slice(-4),
          template: template?.name ?? null,
          response_error: sendPayload?.error ?? null,
          response_details: sendPayload?.details ?? null,
          env: envPresence(),
        });
        await logIntegrationError({
          integration: "whatsapp",
          functionName: "whatsapp-auth",
          errorMessage: String(sendPayload?.error ?? "WhatsApp OTP send failed"),
          context: {
            status: sendResponse.status,
            code: sendPayload?.details?.code ?? null,
            subcode: sendPayload?.details?.subcode ?? null,
            phone_last4: phone.slice(-4),
            template: template?.name ?? null,
            env: envPresence(),
          },
        });
        const templateHint = template ? "תבנית קוד האימות ב-Meta נכשלה" : "נדרשת תבנית אימות מאושרת ב-Meta לשליחת קוד כניסה";
        return json({ error: sendPayload?.error ?? templateHint }, 502);
      }

      const { error: insertError } = await admin.from("whatsapp_login_otps").insert({
        phone_number: phone,
        code_hash: codeHash,
        expires_at: expiresAt,
      });
      if (insertError) throw insertError;

      console.info("whatsapp-auth OTP accepted by WhatsApp", {
        phone_last4: phone.slice(-4),
        template: template?.name ?? null,
        message_id_present: !!sendPayload?.message_id,
      });

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
      // Query auth.users directly via the service role so we don't miss accounts past listUsers' page cap.
      let targetEmail: string | null = null;
      try {
        const { data: rows } = await admin
          .schema("auth" as never)
          .from("users" as never)
          .select("email, phone")
          .or(`phone.eq.${phone},phone.eq.+${phone}`)
          .limit(1);
        const match = (rows ?? [])[0] as { email?: string } | undefined;
        if (match?.email) targetEmail = match.email;
        if (!targetEmail) {
          // Fallback: scan user_metadata.phone_number via listUsers (best-effort).
          const { data: byPhone } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const meta = byPhone?.users?.find((u) => {
            const userPhone = String(u.phone ?? "").replace(/\D/g, "");
            const metaPhone = String((u.user_metadata as { phone_number?: string } | null)?.phone_number ?? "").replace(/\D/g, "");
            return userPhone === phone || metaPhone === phone;
          });
          if (meta?.email) targetEmail = meta.email;
        }
      } catch (lookupErr) {
        console.warn("whatsapp-auth: phone lookup failed, falling back to synthetic email", lookupErr);
      }

      // Fallback: legacy synthetic email account (created on-demand for first-time WA-only logins).
      if (!targetEmail) {
        const syntheticEmail = `${phone}@whatsapp.realtyz.local`;
        const { error: createError } = await admin.auth.admin.createUser({
          email: syntheticEmail,
          phone: `+${phone}`,
          email_confirm: true,
          phone_confirm: true,
        user_metadata: { provider: "whatsapp_wba", phone_number: phone },
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
    console.error("whatsapp-auth unhandled error", safeErrorDetails(error));
    await logIntegrationError({
      integration: "whatsapp",
      functionName: "whatsapp-auth",
      errorMessage: error instanceof Error ? error.message : "Unhandled whatsapp-auth error",
      context: { error: safeErrorDetails(error), env: envPresence() },
    });
    return json({ error: error instanceof Error ? `שגיאת שרת: ${error.message}` : "שגיאת שרת" }, 500);
  }
});

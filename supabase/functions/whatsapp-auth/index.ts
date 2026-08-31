import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";
import { sendSms019 } from "../_shared/sms019.ts";

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

/** Ordered, unique placeholder keys in a template body ({{1}} or {{name}}). */
const templateVariableKeys = (body: string): string[] => {
  const keys: string[] = [];
  for (const m of String(body ?? "").matchAll(/\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g)) {
    const key = m[1].trim();
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
};

/**
 * Builds body components where the OTP code is ALWAYS the first variable
 * ({{1}} / first named placeholder) and any remaining variables are padded so
 * Meta never rejects the send for a parameter-count mismatch.
 */
const buildOtpComponents = (bodyText: string, code: string, varCount: number): unknown[] => {
  const keys = templateVariableKeys(bodyText);
  const count = Math.max(keys.length, varCount || 0);
  if (count === 0) return [];
  const parameters = Array.from({ length: count }, (_, i) => {
    const text = i === 0 ? code : "Realtyz";
    const key = keys[i];
    return key && !/^\d+$/.test(key)
      ? { type: "text", parameter_name: key, text }
      : { type: "text", text };
  });
  return [{ type: "body", parameters }];
};

/** Configurable preferred template names (comma separated), highest priority first. */
const preferredOtpTemplateNames = (): string[] =>
  [
    Deno.env.get("META_WA_OTP_TEMPLATE_NAME") ?? "",
    Deno.env.get("WHATSAPP_OTP_TEMPLATE_NAME") ?? "",
    Deno.env.get("META_WA_OTP_TEMPLATE_FALLBACKS") ?? "sit_property,st_template",
  ]
    .join(",")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Resolves the Meta template used to deliver the login code.
 * Order: configured/approved template name -> approved AUTHENTICATION ->
 * any approved UTILITY/MARKETING template that has at least one variable
 * (the code rides in {{1}}) -> null (free-text, 24h window only).
 */
const resolveOtpTemplate = async (admin: any, code: string) => {
  const { data } = await admin
    .from("wa_message_templates")
    .select("name, language, category, status, body_text, variable_count, synced_at")
    .eq("status", "APPROVED")
    .order("synced_at", { ascending: false })
    .limit(200);
  const rows = ((data ?? []) as any[]).filter((r) => r?.name);

  const pick = (row: any) => {
    const bodyText = String(row.body_text ?? "");
    const varCount = Number(row.variable_count ?? 0);
    const components = buildOtpComponents(bodyText, code, varCount);
    if (components.length === 0) return null; // no slot for the code
    return {
      name: String(row.name),
      language: String(row.language ?? "he"),
      category: String(row.category ?? "").toUpperCase(),
      components,
    };
  };

  // 1. Explicitly configured template names (already approved on the WABA).
  for (const wanted of preferredOtpTemplateNames()) {
    const row = rows.find((r) => String(r.name).toLowerCase() === wanted.toLowerCase());
    const hit = row ? pick(row) : null;
    if (hit) return hit;
  }

  // 2. Dedicated AUTHENTICATION template (carries the copy-code button).
  const auth = rows.find((r) => String(r.category ?? "").toUpperCase() === "AUTHENTICATION");
  if (auth) {
    const hit = pick(auth) ?? {
      name: String(auth.name),
      language: String(auth.language ?? "he"),
      category: "AUTHENTICATION",
      components: [{ type: "body", parameters: [{ type: "text", text: code }] }],
    };
    return {
      ...hit,
      components: [
        ...(hit.components as unknown[]),
        {
          type: "button",
          sub_type: "copy_code",
          index: "0",
          parameters: [{ type: "coupon_code", coupon_code: code }],
        },
      ],
    };
  }

  // 3. Any approved service template with a variable slot for the code.
  for (const cat of ["UTILITY", "MARKETING"]) {
    const row = rows.find((r) => String(r.category ?? "").toUpperCase() === cat);
    const hit = row ? pick(row) : null;
    if (hit) return hit;
  }
  return null;
};




const OTP_TEMPLATE_NAME = "realtyz_login_code";
const OTP_TEMPLATE_LANGUAGE = "he";

/** WABA credentials able to manage templates (waba_id + token). */
const resolveWabaCreds = async (admin: any): Promise<{ wabaId: string; token: string; apiVersion: string } | null> => {
  const envToken = Deno.env.get("META_WA_ACCESS_TOKEN") ?? Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
  const envWaba = Deno.env.get("META_WABA_ID") ?? "";
  try {
    const { data } = await admin
      .from("wa_providers")
      .select("config, updated_at")
      .eq("provider_name", "WBA")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(10);
    for (const row of (data ?? []) as any[]) {
      const cfg = (row?.config ?? {}) as Record<string, unknown>;
      const wabaId = String(cfg.waba_id ?? envWaba ?? "").trim();
      const token = String(cfg.access_token ?? envToken ?? "").trim();
      if (wabaId && token) {
        return { wabaId, token, apiVersion: String(cfg.api_version ?? "v21.0") };
      }
    }
  } catch { /* fall through to env */ }
  if (envWaba && envToken) return { wabaId: envWaba, token: envToken, apiVersion: "v21.0" };
  return null;
};

/**
 * Guarantees an APPROVED AUTHENTICATION template exists for login codes.
 * Meta refuses free-text sends outside an open 24h window, so without this
 * template every OTP silently degraded to the SMS fallback. Creates
 * `realtyz_login_code` (copy-code button, 10-minute expiry) when missing and
 * mirrors the result into `wa_message_templates`.
 */
const ensureOtpTemplate = async (
  admin: any,
): Promise<{ ok: boolean; status?: string; name?: string; language?: string; error?: string }> => {
  const creds = await resolveWabaCreds(admin);
  if (!creds) return { ok: false, error: "חסרים פרטי WABA (waba_id / access token) ליצירת תבנית אימות" };
  const { wabaId, token, apiVersion } = creds;
  const base = `https://graph.facebook.com/${apiVersion}`;

  const cacheTemplate = async (name: string, language: string, status: string) => {
    try {
      const { data: owners } = await admin
        .from("wa_providers")
        .select("user_id")
        .eq("provider_name", "WBA")
        .eq("is_active", true)
        .limit(10);
      const rows = ((owners ?? []) as any[])
        .map((o) => String(o?.user_id ?? "").trim())
        .filter(Boolean)
        .map((ownerId) => ({
          owner_user_id: ownerId,
          name,
          language,
          category: "AUTHENTICATION",
          status: status.toUpperCase(),
          body_text: "{{1}}",
          variable_count: 1,
          has_header_variable: false,
          synced_at: new Date().toISOString(),
        }));
      if (rows.length > 0) {
        await admin.from("wa_message_templates").upsert(rows, { onConflict: "owner_user_id,name,language" });
      }
    } catch { /* cache write is best-effort */ }
  };

  // 1. Already exists on the WABA?
  try {
    const listRes = await fetch(
      `${base}/${wabaId}/message_templates?limit=200&fields=name,language,status,category`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const list = await listRes.json().catch(() => ({} as any));
    const existing = (Array.isArray(list?.data) ? list.data : []).find(
      (t: any) => String(t?.category ?? "").toUpperCase() === "AUTHENTICATION",
    );
    if (existing?.name) {
      const status = String(existing.status ?? "").toUpperCase();
      await cacheTemplate(String(existing.name), String(existing.language ?? OTP_TEMPLATE_LANGUAGE), status);
      return { ok: status === "APPROVED", status, name: String(existing.name), language: String(existing.language ?? OTP_TEMPLATE_LANGUAGE) };
    }
  } catch (error) {
    console.error("whatsapp-auth template list failed", safeErrorDetails(error));
  }

  // 2. Create it.
  const createRes = await fetch(`${base}/${wabaId}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: OTP_TEMPLATE_NAME,
      language: OTP_TEMPLATE_LANGUAGE,
      category: "AUTHENTICATION",
      message_send_ttl_seconds: 600,
      components: [
        { type: "BODY", add_security_recommendation: true },
        { type: "FOOTER", code_expiration_minutes: OTP_TTL_MINUTES },
        { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE" }] },
      ],
    }),
  });
  const created = await createRes.json().catch(() => ({} as any));
  if (!createRes.ok || created?.error) {
    const message = String(created?.error?.message ?? "יצירת תבנית האימות ב-Meta נכשלה");
    console.error("whatsapp-auth template create failed", { message, status: createRes.status });
    return { ok: false, error: message };
  }
  const status = String(created?.status ?? "PENDING").toUpperCase();
  await cacheTemplate(OTP_TEMPLATE_NAME, OTP_TEMPLATE_LANGUAGE, status);
  console.info("whatsapp-auth OTP template provisioned", { name: OTP_TEMPLATE_NAME, status });
  return { ok: status === "APPROVED", status, name: OTP_TEMPLATE_NAME, language: OTP_TEMPLATE_LANGUAGE };
};

/**
 * Which workspace owns this phone number, so the SMS fallback uses that
 * workspace's own 019 sender instead of another workspace's number.
 */
const resolveWorkspaceOwnerForPhone = async (admin: any, phone: string): Promise<string | null> => {
  try {
    const { data } = await admin
      .from("profiles")
      .select("id, active_workspace_owner_id")
      .eq("phone", phone)
      .maybeSingle();
    const row: any = data;
    if (!row?.id) return null;
    return String(row.active_workspace_owner_id || row.id);
  } catch {
    return null;
  }
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

      let template = await resolveOtpTemplate(admin, code);
      if (!template) {
        // No approved AUTHENTICATION template cached — provision one on Meta so
        // codes can reach users who have no open 24h conversation window.
        const provisioned = await ensureOtpTemplate(admin);
        console.info("whatsapp-auth OTP template provisioning", provisioned);
        if (provisioned.ok) template = await resolveOtpTemplate(admin, code);
      }
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
        // Reliability guarantee: if WhatsApp cannot deliver the code, fall back
        // to the workspace's own 019 SMS number (isolated per workspace, with
        // the shared platform 019 account as a last resort).
        const owner = await resolveWorkspaceOwnerForPhone(admin, phone);
        const sms = await sendSms019(admin, phone, `קוד האימות שלך ל-Realtyz: ${code}`, owner);
        if (sms.ok) {
          const { error: smsInsertError } = await admin.from("whatsapp_login_otps").insert({
            phone_number: phone,
            code_hash: codeHash,
            expires_at: expiresAt,
          });
          if (smsInsertError) throw smsInsertError;
          console.info("whatsapp-auth OTP delivered via 019 SMS fallback", {
            phone_last4: phone.slice(-4),
            scope: sms.scope ?? null,
          });
          return json({ success: true, channel: "sms" });
        }

        const templateHint = template ? "תבנית קוד האימות ב-Meta נכשלה" : "נדרשת תבנית אימות מאושרת ב-Meta לשליחת קוד כניסה";
        return json({ error: sendPayload?.error ?? templateHint, sms_error: sms.error ?? null }, 502);
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

    if (action === "provision_template") {
      const provisioned = await ensureOtpTemplate(admin);
      return json({ ...provisioned }, provisioned.ok ? 200 : 200);
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

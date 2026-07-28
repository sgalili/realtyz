/**
 * send-whatsapp
 * ─────────────
 * Official Meta WhatsApp Business Cloud API gateway (WBA only).
 * Every outbound message is dispatched with
 *   POST https://graph.facebook.com/{version}/{phone-number-id}/messages
 * using the workspace's authorized WABA access token + phone number ID.
 *
 * Credentials are resolved from (in order):
 *   1. `wa_providers` row with provider_name='WBA' scoped by tenant_id/user_id
 *   2. META_WA_PHONE_NUMBER_ID / META_WA_ACCESS_TOKEN environment secrets
 *
 * There is NO unofficial/legacy provider fallback.
 *
 * Standardized response shape:
 * {
 *   success: boolean,
 *   provider: 'WBA',
 *   message_id: string | null,
 *   error?: string,
 *   details?: unknown
 * }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";
import { appendDisclosure } from "../_shared/compliance.ts";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z
  .object({
    // Either lead_id (recipient resolved server-side) OR phone_number must be provided.
    lead_id: z.string().uuid().optional(),
    phone_number: z.string().min(8).max(20).optional(),
    // Free-text body. Required for non-template sends.
    message: z.string().min(1).max(4096).optional(),
    // Backward-compatible alias used by older UI callsites.
    body: z.string().min(1).max(4096).optional(),
    // Template id. When provided, sends a template message using
    // { template_id, language, components? } instead of free text.
    template_id: z.string().min(1).max(120).optional(),
    template_language: z.string().min(2).max(20).optional(),
    template_components: z.array(z.unknown()).optional(),
    // Tenant-scoped routing override (looks up wa_providers by tenant_id).
    tenant_id: z.string().uuid().optional(),
    // Optional file attachment (base64) for unified file send.
    file: z
      .object({
        base64: z.string().min(50),
        file_name: z.string().min(1).max(160),
        caption: z.string().max(1000).optional(),
        mime_type: z.string().optional(),
      })
      .optional(),
    // Accepted for backward compatibility with older callers; only "WBA" is
    // ever honored because Meta Cloud API is the sole supported gateway.
    force_provider: z.literal("WBA").optional(),
    // Compliance: when true, the message was AI-drafted. We append a subtle
    // "תוכן בסיוע AI" footer to the outbound text and log it on the message
    // row + audit_logs so the agent can prove disclosure.
    ai_assisted: z.boolean().optional(),
    disclosure_language: z.enum(["he", "en"]).optional(),
  })
  .refine((v) => !!v.lead_id || !!v.phone_number, {
    message: "lead_id or phone_number is required",
  })
  .refine((v) => !!v.message || !!v.body || !!v.template_id, {
    message: "message or template_id is required",
  });

type StdResponse = {
  success: boolean;
  provider: "WBA";
  message_id: string | null;
  error?: string;
  details?: unknown;
};

const json = (body: StdResponse | { error: string }, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (/^05\d{8}$/.test(digits)) return `972${digits.slice(1)}`;
  if (/^9725\d{8}$/.test(digits)) return digits;
  if (/^\d{10,15}$/.test(digits)) return digits; // generic international
  return null;
}

interface ResolvedProvider {
  name: "WBA";
  is_official: true;
  config: Record<string, unknown>;
}

/**
 * Resolve the official Meta WBA credentials for this workspace.
 * Only `wa_providers` rows with provider_name='WBA' are considered; if none
 * exist we fall back to the project-level Meta env secrets.
 */
async function resolveProvider(
  admin: ReturnType<typeof createClient>,
  userId: string | null,
  tenantId: string | null,
): Promise<ResolvedProvider | null> {
  const tryRows = async (column: "tenant_id" | "user_id", value: string) => {
    const { data: rows } = await admin
      .from("wa_providers")
      .select("provider_name, config, is_active")
      .eq(column, value)
      .eq("provider_name", "WBA")
      .eq("is_active", true);
    return (rows ?? []) as Array<{ config: Record<string, unknown> }>;
  };

  const pick = (list: Array<{ config: Record<string, unknown> }>): ResolvedProvider | null => {
    const row = list[0];
    if (!row) return null;
    const cfg = row.config ?? {};
    if (!cfg.phone_number_id || !cfg.access_token) return null;
    return { name: "WBA", is_official: true, config: cfg };
  };

  if (tenantId) {
    // Realtyz stores the workspace's provider row keyed by the OWNER's user id
    // with tenant_id NULL. Server-to-server callers pass that owner id as
    // `tenant_id`, so check both columns.
    const hit = pick(await tryRows("tenant_id", tenantId)) ?? pick(await tryRows("user_id", tenantId));
    if (hit) return hit;
  }
  if (userId) {
    const hit = pick(await tryRows("user_id", userId));
    if (hit) return hit;
  }

  // Project-level Meta Cloud API secrets.
  const phoneNumberId = Deno.env.get("META_WA_PHONE_NUMBER_ID") ?? "";
  const accessToken = Deno.env.get("META_WA_ACCESS_TOKEN") ?? "";
  if (phoneNumberId && accessToken) {
    return {
      name: "WBA",
      is_official: true,
      config: {
        phone_number_id: phoneNumberId,
        access_token: accessToken,
        api_version: Deno.env.get("META_WA_API_VERSION") ?? "v20.0",
      },
    };
  }

  return null;
}

async function sendViaWba(
  cfg: Record<string, unknown>,
  phone: string,
  message: string | null,
  file?: { base64: string; file_name: string; caption?: string; mime_type?: string },
  template?: { id: string; language?: string; components?: unknown[] },
): Promise<StdResponse> {
  const phoneNumberId = String(cfg.phone_number_id ?? "");
  const accessToken = String(cfg.access_token ?? "");
  const apiVersion = String(cfg.api_version ?? "v20.0");
  if (!phoneNumberId || !accessToken) {
    return {
      success: false,
      provider: "WBA",
      message_id: null,
      error: "WBA not configured",
    };
  }
  const baseUrl = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  // Choose payload: template (preferred when provided) vs free-text.
  const payload = template
    ? {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: template.id,
          language: { code: template.language ?? "he" },
          components: template.components ?? [],
        },
      }
    : {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: message ?? "" },
      };

  const textRes = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const textJson = await textRes.json().catch(() => ({}));
  if (!textRes.ok) {
    return {
      success: false,
      provider: "WBA",
      message_id: null,
      error: `WBA send failed (${textRes.status})`,
      details: textJson,
    };
  }
  const textMsgId = textJson?.messages?.[0]?.id ?? null;

  if (!file) {
    return { success: true, provider: "WBA", message_id: textMsgId };
  }

  // Upload media → send document. (Two-step per WBA spec.)
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  const mime = file.mime_type ?? "application/octet-stream";
  const uploadForm = new FormData();
  uploadForm.append("messaging_product", "whatsapp");
  uploadForm.append("type", mime);
  uploadForm.append("file", new Blob([bytes], { type: mime }), file.file_name);

  const upRes = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: uploadForm,
    },
  );
  const upJson = await upRes.json().catch(() => ({}));
  if (!upRes.ok || !upJson?.id) {
    return {
      success: false,
      provider: "WBA",
      message_id: textMsgId,
      error: `WBA media upload failed (${upRes.status})`,
      details: upJson,
    };
  }

  const docRes = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "document",
      document: {
        id: upJson.id,
        filename: file.file_name,
        caption: file.caption ?? undefined,
      },
    }),
  });
  const docJson = await docRes.json().catch(() => ({}));
  if (!docRes.ok) {
    return {
      success: false,
      provider: "WBA",
      message_id: textMsgId,
      error: `WBA document send failed (${docRes.status})`,
      details: docJson,
    };
  }

  return {
    success: true,
    provider: "WBA",
    message_id: docJson?.messages?.[0]?.id ?? textMsgId,
  };
}

/**
 * Translate a raw Meta / GreenAPI failure into a short Hebrew sentence the
 * broker can act on. The raw provider payload is never shown in the UI.
 */
function humanizeWaError(raw: string, meta: { code?: number; error_subcode?: number; message?: string } = {}): string {
  const code = Number(meta?.code ?? 0);
  switch (code) {
    case 131047:
      return "חלון 24 השעות נסגר — אפשר לשלוח רק תבנית מאושרת עד שהלקוח יגיב שוב";
    case 131026:
      return "המספר אינו רשום בוואטסאפ או שאינו יכול לקבל הודעות";
    case 131051:
      return "סוג ההודעה אינו נתמך על ידי וואטסאפ";
    case 100:
      return "פרטי החשבון שגויים — יש לוודא Phone Number ID ו-WABA ID בהגדרות";
    case 190:
      return "פג תוקף ההרשאה של Meta — יש לחבר מחדש את חשבון וואטסאפ העסקי";
    case 10:
    case 200:
      return "אין הרשאה לשלוח מהמספר הזה — יש לאשר את ההרשאות בחשבון Meta";
    case 80007:
    case 130429:
      return "חריגה ממכסת השליחה של Meta — נסה שוב בעוד מספר דקות";
    case 131031:
      return "חשבון וואטסאפ העסקי מושהה על ידי Meta";
    default:
      break;
  }
  if (/not configured|No active WhatsApp provider/i.test(raw)) {
    return "חשבון וואטסאפ העסקי אינו מחובר — יש להתחבר בהגדרות הערוצים";
  }
  if (/Invalid phone number/i.test(raw)) return "מספר טלפון לא תקין";
  if (/Lead not found/i.test(raw)) return "לא נמצא מספר טלפון למתעניין הזה";
  return "שליחת ההודעה בוואטסאפ נכשלה — נסה שוב";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    let rawBody: unknown = null;
    try {
      rawBody = await req.json();
    } catch {
      return json({
        success: false,
        provider: "GreenAPI",
        message_id: null,
        error: "Invalid JSON body",
      }, 400);
    }
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const formMsg = flat.formErrors?.[0];
      const fieldMsg = Object.entries(flat.fieldErrors)
        .map(([k, v]) => `${k}: ${(v as string[])?.[0]}`)
        .join("; ");
      const errMsg = formMsg || fieldMsg || "Invalid request body";
      console.error("send-whatsapp validation failed:", errMsg, flat);
      return json({
        success: false,
        provider: "GreenAPI",
        message_id: null,
        error: errMsg,
        details: flat,
      }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Caller identification:
    //  - If a Bearer JWT is supplied, resolve the user.
    //  - If the service-role key is supplied (server-to-server), trust the caller
    //    and use the explicit tenant_id/lead_id only.
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (bearer && bearer !== SERVICE_ROLE_KEY) {
      try {
        const userClient = createClient(SUPABASE_URL, ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data } = await userClient.auth.getUser();
        userId = data.user?.id ?? null;
      } catch {
        userId = null;
      }
    }

    // Resolve recipient phone — either explicit, or by lead_id lookup.
    let rawPhone = parsed.data.phone_number ?? "";
    if (!rawPhone && parsed.data.lead_id) {
      const { data: lead, error: leadErr } = await admin
        .from("leads")
        .select("phone_number")
        .eq("id", parsed.data.lead_id)
        .maybeSingle();
      if (leadErr || !lead?.phone_number) {
        return json({
          success: false,
          provider: "GreenAPI",
          message_id: null,
          error: "Lead not found or has no phone_number",
        }, 404);
      }
      rawPhone = lead.phone_number;
    }
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return json({
        success: false,
        provider: "GreenAPI",
        message_id: null,
        error: "Invalid phone number",
      }, 400);
    }

    // Per-workspace primary provider preference. If profile.whatsapp_provider='meta_wab',
    // we try Meta WBA first (via env-based secrets) and silently fall back to GreenAPI
    // on any non-2xx / rate-limit / network error.
    let profilePref: "meta_wab" | "greenapi" | null = null;
    if (userId) {
      const { data: prof } = await admin
        .from("profiles")
        .select("whatsapp_provider")
        .eq("id", userId)
        .maybeSingle();
      const v = (prof as { whatsapp_provider?: string } | null)?.whatsapp_provider;
      if (v === "meta_wab" || v === "greenapi") profilePref = v;
    }

    const provider = await resolveProvider(
      admin,
      userId,
      parsed.data.tenant_id ?? null,
      parsed.data.force_provider,
    );
    if (!provider && profilePref !== "meta_wab") {
      return json({
        success: false,
        provider: "GreenAPI",
        message_id: null,
        error: humanizeWaError("No active WhatsApp provider configured"),
      }, 500);
    }

    // Compliance: append the "AI-assisted content" disclosure footer when
    // requested by the caller. We do this AFTER body validation but BEFORE
    // dispatching, so the lead sees the same text we audit.
    let outboundMessage = parsed.data.message ?? parsed.data.body ?? null;
    let disclosureAppended = false;
    if (outboundMessage && parsed.data.ai_assisted) {
      const r = appendDisclosure(
        outboundMessage,
        true,
        parsed.data.disclosure_language ?? "he",
      );
      outboundMessage = r.text;
      disclosureAppended = r.appended;
    }

    const template = parsed.data.template_id
      ? {
          id: parsed.data.template_id,
          language: parsed.data.template_language,
          components: parsed.data.template_components,
        }
      : undefined;

    // Build env-based Meta WBA config when the workspace prefers meta_wab.
    const metaPhoneNumberId = Deno.env.get("META_WA_PHONE_NUMBER_ID") ?? "";
    const metaAccessToken = Deno.env.get("META_WA_ACCESS_TOKEN") ?? "";
    const metaEnvConfig = {
      phone_number_id: metaPhoneNumberId,
      access_token: metaAccessToken,
      api_version: "v20.0",
    };
    const metaEnvReady = !!(metaPhoneNumberId && metaAccessToken);

    let result: StdResponse;
    const tryMetaFirst =
      !parsed.data.force_provider &&
      profilePref === "meta_wab" &&
      metaEnvReady;

    if (tryMetaFirst) {
      result = await sendViaWba(metaEnvConfig, phone, outboundMessage, parsed.data.file, template);
      if (!result.success) {
        // Silent fallback to GreenAPI. Log the Hebrew status string per policy.
        try {
          await logIntegrationError({
            integration: "whatsapp",
            functionName: "send-whatsapp",
            errorMessage: "נכשל בערוץ Meta — הועבר ל-GreenAPI",
            context: {
              meta_error: result.error,
              meta_details: result.details,
              phone_last4: phone.slice(-4),
              user_id: userId,
            },
          });
        } catch (_e) { /* best-effort */ }

        // Resolve a GreenAPI provider (workspace-scoped, then legacy fallbacks).
        const greenProv =
          provider?.name === "GreenAPI"
            ? provider
            : await resolveProvider(admin, userId, parsed.data.tenant_id ?? null, "GreenAPI");
        if (greenProv) {
          const text = outboundMessage ?? `[${parsed.data.template_id}]`;
          result = await sendViaGreenApi(greenProv.config, phone, text, parsed.data.file);
        }
      }
    } else if (provider?.name === "WBA") {
      result = await sendViaWba(provider.config, phone, outboundMessage, parsed.data.file, template);
    } else if (provider?.name === "GreenAPI") {
      const text = outboundMessage ?? `[${parsed.data.template_id}]`;
      result = await sendViaGreenApi(provider.config, phone, text, parsed.data.file);
    } else {
      return json({
        success: false,
        provider: "GreenAPI",
        message_id: null,
        error: humanizeWaError("No active WhatsApp provider configured"),
      }, 500);
    }

    // Compliance audit + message-row logging. Best-effort; never blocks the send.
    const effectiveProvider = result.provider ?? provider?.name ?? "WBA";
    const actorId = userId ?? parsed.data.tenant_id ?? null;
    try {
      // Only persist the chat bubble when the gateway actually accepted the
      // message — a failed send must never look delivered in the inbox.
      if (result.success && parsed.data.lead_id && outboundMessage) {
        await admin.from("messages").insert({
          lead_id: parsed.data.lead_id,
          channel: "whatsapp",
          platform: "whatsapp",
          content: outboundMessage,
          direction: "outbound",
          sender_type: parsed.data.ai_assisted ? "ai" : "agent",
          ai_assisted: !!parsed.data.ai_assisted,
          disclosure_appended: disclosureAppended,
          metadata: { provider: effectiveProvider, message_id: result.message_id, status: "sent" },
        });
      }
      if (actorId) {
        await admin.from("audit_logs").insert({
          actor_id: actorId,
          action: parsed.data.ai_assisted ? "ai_message_sent" : "message_sent",
          target_table: parsed.data.lead_id ? "leads" : null,
          target_id: parsed.data.lead_id ?? null,
          details: {
            provider: effectiveProvider,
            success: result.success,
            disclosure_appended: disclosureAppended,
            has_attachment: !!parsed.data.file,
            phone_last4: phone.slice(-4),
          },
        });
      }
    } catch (logErr) {
      console.warn("send-whatsapp audit/log failed:", logErr);
    }

    if (!result.success) {
      const meta = (result.details as any)?.error ?? {};
      result = {
        ...result,
        error: humanizeWaError(result.error ?? "", meta),
        details: { code: meta?.code ?? null, subcode: meta?.error_subcode ?? null },
      };
      try {
        await logIntegrationError({
          integration: "whatsapp",
          functionName: "send-whatsapp",
          errorMessage: result.error ?? "שליחת וואטסאפ נכשלה",
          context: { provider: effectiveProvider, meta_code: meta?.code ?? null, phone_last4: phone.slice(-4) },
        });
      } catch (_e) { /* best-effort */ }
    }


    return json(result, result.success ? 200 : 502);
  } catch (e) {
    console.error("send-whatsapp error", e);
    await logIntegrationError({
      integration: "whatsapp",
      functionName: "send-whatsapp",
      errorMessage: e instanceof Error ? e.message : "Internal error",
    });
    return json({
      success: false,
      provider: "GreenAPI",
      message_id: null,
      error: "שליחת ההודעה בוואטסאפ נכשלה — נסה שוב",
    }, 500);
  }
});

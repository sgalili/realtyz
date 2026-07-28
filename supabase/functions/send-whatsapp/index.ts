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
 *      (legacy aliases META_PHONE_NUMBER_ID / META_WHATSAPP_TOKEN also work)
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

const safeErrorDetails = (error: unknown) => ({
  name: error instanceof Error ? error.name : typeof error,
  message: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack?.slice(0, 4000) : undefined,
});

const envPresence = () => ({
  has_meta_wa_access_token: !!Deno.env.get("META_WA_ACCESS_TOKEN"),
  has_meta_whatsapp_token: !!Deno.env.get("META_WHATSAPP_TOKEN"),
  has_meta_wa_phone_number_id: !!Deno.env.get("META_WA_PHONE_NUMBER_ID"),
  has_meta_phone_number_id: !!Deno.env.get("META_PHONE_NUMBER_ID"),
  meta_wa_api_version: Deno.env.get("META_WA_API_VERSION") ?? null,
  meta_api_version: Deno.env.get("META_API_VERSION") ?? null,
  whatsapp_api_version: Deno.env.get("WHATSAPP_API_VERSION") ?? null,
});

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

type MetaError = {
  code?: number;
  error_subcode?: number;
  message?: string;
  type?: string;
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
      .select("provider_name, config, is_active, updated_at")
      .eq(column, value)
      .eq("provider_name", "WBA")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });
    return (rows ?? []) as Array<{ config: Record<string, unknown> }>;
  };

  const pick = (list: Array<{ config: Record<string, unknown> }>): ResolvedProvider | null => {
    const row = list[0];
    if (!row) return null;
    const cfg = row.config ?? {};
    if (!cfg.phone_number_id || !cfg.access_token) return null;
    return { name: "WBA", is_official: true, config: cfg };
  };

  const ids = [tenantId, userId].filter(Boolean) as string[];
  for (const id of ids) {
    const hit = pick(await tryRows("tenant_id", id)) ?? pick(await tryRows("user_id", id));
    if (hit) return hit;
  }

  // Team members don't own the WhatsApp Business number — fall back to the
  // workspace owner's credentials.
  for (const id of ids) {
    const { data: prof } = await admin
      .from("profiles")
      .select("active_workspace_owner_id, workspace_owner_id")
      .eq("id", id)
      .maybeSingle();
    const owner = ((prof as any)?.active_workspace_owner_id ?? (prof as any)?.workspace_owner_id) as string | null;
    if (owner && !ids.includes(owner)) {
      const hit = pick(await tryRows("tenant_id", owner)) ?? pick(await tryRows("user_id", owner));
      if (hit) return hit;
    }
  }

  // Cron/server-to-server paths sometimes only know the recipient phone. If the
  // project has a single active authorized WBA row, use it instead of failing
  // silently because no user JWT was present.
  if (!ids.length) {
    const { data: rows } = await admin
      .from("wa_providers")
      .select("provider_name, config, is_active, is_official, updated_at")
      .eq("provider_name", "WBA")
      .eq("is_active", true)
      .eq("is_official", true)
      .order("updated_at", { ascending: false })
      .limit(5);
    const authorized = (rows ?? []).filter((row: any) => row?.config?.authorized !== false);
    const hit = pick((authorized.length ? authorized : rows ?? []) as Array<{ config: Record<string, unknown> }>);
    if (hit) return hit;
  }

  // Project-level Meta Cloud API secrets.
  const phoneNumberId = Deno.env.get("META_WA_PHONE_NUMBER_ID") ?? Deno.env.get("META_PHONE_NUMBER_ID") ?? "";
  const accessToken = Deno.env.get("META_WA_ACCESS_TOKEN") ?? Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
  if (phoneNumberId && accessToken) {
    return {
      name: "WBA",
      is_official: true,
      config: {
        phone_number_id: phoneNumberId,
        access_token: accessToken,
        api_version: Deno.env.get("META_WA_API_VERSION") ?? Deno.env.get("META_API_VERSION") ?? Deno.env.get("WHATSAPP_API_VERSION") ?? "v20.0",
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
  if (phoneNumberId.startsWith("+") || /[^0-9]/.test(phoneNumberId)) {
    return {
      success: false,
      provider: "WBA",
      message_id: null,
      error: "Invalid WBA phone_number_id",
      details: { error: { code: 100, message: "phone_number_id must be the numeric Meta node ID, not a phone number" } },
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

  let textRes: Response;
  let textJson: any = {};
  try {
    textRes = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    textJson = await textRes.json().catch(() => ({}));
  } catch (error) {
    console.error("send-whatsapp Meta text request threw", {
      phone_number_id_last4: phoneNumberId.slice(-4),
      phone_last4: phone.slice(-4),
      api_version: apiVersion,
      error: safeErrorDetails(error),
    });
    return {
      success: false,
      provider: "WBA",
      message_id: null,
      error: "WBA network request failed",
      details: { error: safeErrorDetails(error) },
    };
  }
  if (!textRes.ok) {
    console.error("send-whatsapp Meta text rejected", {
      status: textRes.status,
      phone_number_id_last4: phoneNumberId.slice(-4),
      phone_last4: phone.slice(-4),
      api_version: apiVersion,
      meta_error: textJson?.error ?? textJson,
    });
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

  let upRes: Response;
  let upJson: any = {};
  try {
    upRes = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: uploadForm,
      },
    );
    upJson = await upRes.json().catch(() => ({}));
  } catch (error) {
    console.error("send-whatsapp Meta media upload threw", {
      phone_number_id_last4: phoneNumberId.slice(-4),
      phone_last4: phone.slice(-4),
      api_version: apiVersion,
      error: safeErrorDetails(error),
    });
    return {
      success: false,
      provider: "WBA",
      message_id: textMsgId,
      error: "WBA media upload network request failed",
      details: { error: safeErrorDetails(error) },
    };
  }
  if (!upRes.ok || !upJson?.id) {
    console.error("send-whatsapp Meta media upload rejected", {
      status: upRes.status,
      phone_number_id_last4: phoneNumberId.slice(-4),
      phone_last4: phone.slice(-4),
      api_version: apiVersion,
      meta_error: upJson?.error ?? upJson,
    });
    return {
      success: false,
      provider: "WBA",
      message_id: textMsgId,
      error: `WBA media upload failed (${upRes.status})`,
      details: upJson,
    };
  }

  let docRes: Response;
  let docJson: any = {};
  try {
    docRes = await fetch(baseUrl, {
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
    docJson = await docRes.json().catch(() => ({}));
  } catch (error) {
    console.error("send-whatsapp Meta document request threw", {
      phone_number_id_last4: phoneNumberId.slice(-4),
      phone_last4: phone.slice(-4),
      api_version: apiVersion,
      error: safeErrorDetails(error),
    });
    return {
      success: false,
      provider: "WBA",
      message_id: textMsgId,
      error: "WBA document network request failed",
      details: { error: safeErrorDetails(error) },
    };
  }
  if (!docRes.ok) {
    console.error("send-whatsapp Meta document rejected", {
      status: docRes.status,
      phone_number_id_last4: phoneNumberId.slice(-4),
      phone_last4: phone.slice(-4),
      api_version: apiVersion,
      meta_error: docJson?.error ?? docJson,
    });
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
 * Classify a Meta failure into an actionable category so permission /
 * token-scope problems are never buried inside a generic "send failed".
 */
type WaErrorCategory =
  | "permission_scope"
  | "token_expired"
  | "token_invalid"
  | "config"
  | "template"
  | "session_window"
  | "recipient"
  | "rate_limit"
  | "account_suspended"
  | "network"
  | "unknown";

function classifyMetaError(
  raw: string,
  meta: MetaError = {},
): { category: WaErrorCategory; hebrew: string } {
  const code = Number(meta?.code ?? 0);
  const subcode = Number(meta?.error_subcode ?? 0);
  const msg = `${meta?.message ?? ""} ${raw ?? ""}`;

  // ── Token scope / permission failures ──────────────────────────────
  if (/whatsapp_business_messaging/i.test(msg)) {
    return {
      category: "permission_scope",
      hebrew:
        "חסרה ההרשאה whatsapp_business_messaging לטוקן של Meta — יש להוסיף את ההרשאה לאפליקציה ולהנפיק טוקן חדש",
    };
  }
  if (/whatsapp_business_management/i.test(msg)) {
    return {
      category: "permission_scope",
      hebrew:
        "חסרה ההרשאה whatsapp_business_management לטוקן של Meta — יש להוסיף את ההרשאה בהגדרות האפליקציה ולחבר מחדש",
    };
  }
  if (code === 190) {
    if (subcode === 463 || /expired/i.test(msg)) {
      return {
        category: "token_expired",
        hebrew:
          "טוקן הגישה של Meta פג תוקף (ככל הנראה טוקן בדיקה זמני) — יש להנפיק טוקן קבוע (System User) ולחבר מחדש בהגדרות",
      };
    }
    if (subcode === 467) {
      return {
        category: "token_invalid",
        hebrew: "טוקן הגישה של Meta אינו תקף יותר — יש לחבר מחדש את חשבון וואטסאפ העסקי",
      };
    }
    return {
      category: "token_expired",
      hebrew: "פג תוקף ההרשאה של Meta — יש לחבר מחדש את חשבון וואטסאפ העסקי",
    };
  }
  if (code === 200 || code === 299 || code === 10 || code === 3 || code === 4001) {
    return {
      category: "permission_scope",
      hebrew:
        "לטוקן של Meta אין הרשאה לשלוח מהמספר הזה — יש לוודא שהמשתמש/האפליקציה מורשים ל-WABA ושכל ההרשאות (whatsapp_business_messaging) אושרו",
    };
  }
  if (code === 100 && (subcode === 33 || /does not exist|cannot be loaded|permission/i.test(msg))) {
    return {
      category: subcode === 33 ? "config" : "permission_scope",
      hebrew:
        subcode === 33
          ? "Phone Number ID שגוי — יש להזין את מזהה המספר המספרי מ-Meta, לא את מספר הטלפון"
          : "אין גישה למשאב הזה ב-Meta — הטוקן אינו מורשה ל-Phone Number ID / WABA שהוגדרו",
    };
  }

  switch (code) {
    case 131008:
      return { category: "template", hebrew: "חסר פרמטר בתבנית וואטסאפ — בדוק את משתני התבנית המאושרת" };
    case 131047:
      return {
        category: "session_window",
        hebrew: "חלון 24 השעות נסגר — אפשר לשלוח רק תבנית מאושרת עד שהלקוח יגיב שוב",
      };
    case 131026:
      return { category: "recipient", hebrew: "המספר אינו רשום בוואטסאפ או שאינו יכול לקבל הודעות" };
    case 132000:
    case 132001:
    case 132012:
      return { category: "template", hebrew: "תבנית הוואטסאפ אינה מאושרת או שאינה תואמת לשפה/משתנים שהוגדרו" };
    case 131051:
      return { category: "unknown", hebrew: "סוג ההודעה אינו נתמך על ידי וואטסאפ" };
    case 100:
      return { category: "config", hebrew: "פרטי החשבון שגויים — יש לוודא Phone Number ID ו-WABA ID בהגדרות" };
    case 80007:
    case 130429:
      return { category: "rate_limit", hebrew: "חריגה ממכסת השליחה של Meta — נסה שוב בעוד מספר דקות" };
    case 131031:
      return { category: "account_suspended", hebrew: "חשבון וואטסאפ העסקי מושהה על ידי Meta" };
    default:
      break;
  }

  if (/OAuth|access token|token scope|permission/i.test(msg)) {
    return {
      category: "permission_scope",
      hebrew: "בעיית הרשאות בטוקן של Meta — יש לבדוק את ההרשאות ולהנפיק טוקן חדש",
    };
  }
  if (/phone_number_id/i.test(raw)) {
    return {
      category: "config",
      hebrew: "Phone Number ID שגוי — יש להזין את מזהה המספר המספרי מ-Meta, לא את מספר הטלפון",
    };
  }
  if (/not configured|No active WhatsApp provider/i.test(raw)) {
    return {
      category: "config",
      hebrew: "חשבון וואטסאפ העסקי אינו מחובר — יש להתחבר בהגדרות הערוצים",
    };
  }
  if (/network request failed/i.test(raw)) {
    return { category: "network", hebrew: "השרת של Meta לא זמין כרגע — נסה שוב בעוד רגע" };
  }
  if (/Invalid phone number/i.test(raw)) return { category: "recipient", hebrew: "מספר טלפון לא תקין" };
  if (/Lead not found/i.test(raw)) return { category: "recipient", hebrew: "לא נמצא מספר טלפון למתעניין הזה" };
  return { category: "unknown", hebrew: "שליחת ההודעה בוואטסאפ נכשלה — נסה שוב" };
}

/**
 * Translate a raw Meta failure into a short Hebrew sentence the
 * broker can act on. The raw provider payload is never shown in the UI.
 */
function humanizeWaError(raw: string, meta: MetaError = {}): string {
  return classifyMetaError(raw, meta).hebrew;
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
        provider: "WBA",
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
        provider: "WBA",
        message_id: null,
        error: errMsg,
        details: flat,
      }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
      console.error("send-whatsapp missing backend env", {
        has_supabase_url: !!SUPABASE_URL,
        has_service_role_key: !!SERVICE_ROLE_KEY,
        has_anon_key: !!ANON_KEY,
      });
      return json({
        success: false,
        provider: "WBA",
        message_id: null,
        error: "Backend environment is not configured",
      }, 500);
    }
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
    let routingTenantId = parsed.data.tenant_id ?? null;
    if (!rawPhone && parsed.data.lead_id) {
      const { data: lead, error: leadErr } = await admin
        .from("leads")
        .select("phone_number, user_id")
        .eq("id", parsed.data.lead_id)
        .maybeSingle();
      if (leadErr || !lead?.phone_number) {
        return json({
          success: false,
          provider: "WBA",
          message_id: null,
          error: "Lead not found or has no phone_number",
        }, 404);
      }
      rawPhone = lead.phone_number;
      routingTenantId = routingTenantId ?? ((lead as any)?.user_id ?? null);
    } else if (parsed.data.lead_id && !routingTenantId) {
      const { data: lead } = await admin
        .from("leads")
        .select("user_id")
        .eq("id", parsed.data.lead_id)
        .maybeSingle();
      routingTenantId = ((lead as any)?.user_id ?? null) as string | null;
    }
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return json({
        success: false,
        provider: "WBA",
        message_id: null,
        error: "Invalid phone number",
      }, 400);
    }

    // Official Meta WhatsApp Business Cloud API credentials for this workspace.
    const provider = await resolveProvider(
      admin,
      userId,
      routingTenantId,
    );
    if (!provider) {
      console.error("send-whatsapp no active WBA provider", {
        user_routed: !!userId,
        tenant_routed: !!routingTenantId,
        env: envPresence(),
      });
      return json({
        success: false,
        provider: "WBA",
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

    let result: StdResponse = await sendViaWba(
      provider.config,
      phone,
      outboundMessage,
      parsed.data.file,
      template,
    );


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
            tenant_routed: !!routingTenantId,
          },
        });
      }
    } catch (logErr) {
      console.warn("send-whatsapp audit/log failed:", logErr);
    }

    if (!result.success) {
      const meta = (result.details as any)?.error ?? {};
      const rawError = result.error ?? "";
      const classified = classifyMetaError(rawError, meta);
      const isAuthIssue =
        classified.category === "permission_scope" ||
        classified.category === "token_expired" ||
        classified.category === "token_invalid";
      result = {
        ...result,
        error: classified.hebrew,
        details: {
          code: meta?.code ?? null,
          subcode: meta?.error_subcode ?? null,
          type: meta?.type ?? null,
          category: classified.category,
          meta_message: meta?.message ?? null,
          meta_details: meta?.error_data?.details ?? null,
          raw_error: rawError || null,
        },
      };
      if (isAuthIssue) {
        console.error("send-whatsapp Meta permission/token failure", {
          category: classified.category,
          meta_code: meta?.code ?? null,
          meta_subcode: meta?.error_subcode ?? null,
          meta_type: meta?.type ?? null,
          meta_message: meta?.message ?? null,
          hebrew: classified.hebrew,
          env: envPresence(),
        });
      }
      try {
        await logIntegrationError({
          integration: "whatsapp",
          functionName: "send-whatsapp",
          errorCode: meta?.code != null
            ? `${classified.category}:${meta.code}${meta?.error_subcode ? `/${meta.error_subcode}` : ""}`
            : classified.category,
          errorMessage: classified.hebrew,
          context: {
            provider: effectiveProvider,
            category: classified.category,
            auth_issue: isAuthIssue,
            meta_code: meta?.code ?? null,
            meta_subcode: meta?.error_subcode ?? null,
            meta_type: meta?.type ?? null,
            meta_message: meta?.message ?? null,
            raw_error: rawError,
            phone_last4: phone.slice(-4),
            tenant_routed: !!routingTenantId,
            template: parsed.data.template_id ?? null,
            env: envPresence(),
          },
        });
      } catch (_e) { /* best-effort */ }
    } else {

      console.info("send-whatsapp accepted by Meta", {
        provider: effectiveProvider,
        phone_last4: phone.slice(-4),
        message_id_present: !!result.message_id,
        tenant_routed: !!routingTenantId,
        template: parsed.data.template_id ?? null,
      });
    }


    return json(result, result.success ? 200 : 502);
  } catch (e) {
    console.error("send-whatsapp unhandled error", safeErrorDetails(e));
    await logIntegrationError({
      integration: "whatsapp",
      functionName: "send-whatsapp",
      errorMessage: e instanceof Error ? e.message : "Internal error",
      context: { error: safeErrorDetails(e), env: envPresence() },
    });
    return json({
      success: false,
      provider: "WBA",
      message_id: null,
      error: e instanceof Error ? `שליחת ההודעה בוואטסאפ נכשלה: ${e.message}` : "שליחת ההודעה בוואטסאפ נכשלה — נסה שוב",
    }, 500);
  }
});

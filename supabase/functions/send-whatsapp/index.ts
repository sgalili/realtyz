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
    // Dynamic template variables. Keys may be placeholder names
    // ({{first_name}}) or positional indexes ("1", "2"). Missing values are
    // auto-filled from the lead / listing / workspace branding.
    template_variables: z.record(z.string().max(600)).optional(),
    // Optional listing used to resolve property-address variables.
    listing_id: z.string().uuid().optional(),
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
  source: "workspace" | "central";
}

/** Project-level (central platform) Meta Cloud API credentials. */
function centralMetaConfig(): Record<string, unknown> | null {
  const phoneNumberId = Deno.env.get("META_WA_PHONE_NUMBER_ID") ?? Deno.env.get("META_PHONE_NUMBER_ID") ?? "";
  const accessToken = Deno.env.get("META_WA_ACCESS_TOKEN") ?? Deno.env.get("META_WHATSAPP_TOKEN") ?? "";
  if (!phoneNumberId || !accessToken) return null;
  return {
    phone_number_id: phoneNumberId,
    access_token: accessToken,
    api_version:
      Deno.env.get("META_WA_API_VERSION") ??
      Deno.env.get("META_API_VERSION") ??
      Deno.env.get("WHATSAPP_API_VERSION") ??
      "v26.0",
  };
}

/**
 * Resolve the official Meta WBA credentials for this workspace.
 * Only `wa_providers` rows with provider_name='WBA' are considered; if none
 * exist we fall back to the project-level Meta env secrets.
 *
 * When the workspace is configured for 'official_meta' (`preferCentral`), the
 * central platform Meta Cloud API number is used first, and the workspace's
 * own registered WABA row is only a fallback.
 */
async function resolveProvider(
  admin: ReturnType<typeof createClient>,
  userId: string | null,
  tenantId: string | null,
  preferCentral = false,
): Promise<ResolvedProvider | null> {
  if (preferCentral) {
    const central = centralMetaConfig();
    if (central) return { name: "WBA", is_official: true, config: central, source: "central" };
  }
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
    // Never stop at the newest row: partially-registered WABA rows (no
    // phone_number_id / access_token yet) must be skipped in favour of a row
    // that actually carries usable Cloud API credentials.
    for (const row of list) {
      const cfg = row?.config ?? {};
      if (cfg.phone_number_id && cfg.access_token) {
        return { name: "WBA", is_official: true, config: cfg, source: "workspace" };
      }
    }
    return null;
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

  // Shared platform number: the official Meta WABA number is the same for every
  // workspace, so a workspace whose own row is only partially registered (no
  // phone_number_id / access_token yet) must still send through the platform
  // row instead of failing with "WhatsApp not connected". This also covers
  // cron/server-to-server paths where no user JWT was present.
  {
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
  const central = centralMetaConfig();
  if (central) return { name: "WBA", is_official: true, config: central, source: "central" };

  return null;
}

/**
 * Resolve the workspace that owns this send. The transport itself is fixed:
 * WhatsApp always leaves through the official Meta Cloud API, so this only
 * resolves the owning workspace id used for provider credentials and logging.
 */
async function resolveWorkspaceOwner(
  admin: ReturnType<typeof createClient>,
  userId: string | null,
  tenantId: string | null,
): Promise<{ mode: "official_meta"; owner_id: string | null }> {
  const ids = [tenantId, userId].filter(Boolean) as string[];
  const candidates = [...ids];
  for (const id of ids) {
    const { data: prof } = await admin
      .from("profiles")
      .select("active_workspace_owner_id, workspace_owner_id")
      .eq("id", id)
      .maybeSingle();
    const owner = ((prof as any)?.active_workspace_owner_id ?? (prof as any)?.workspace_owner_id) as string | null;
    if (owner && !candidates.includes(owner)) candidates.push(owner);
  }
  for (const id of candidates) {
    const { data } = await admin
      .from("workspace_whatsapp_settings")
      .select("workspace_owner_id")
      .eq("workspace_owner_id", id)
      .maybeSingle();
    if ((data as any)?.workspace_owner_id) return { mode: "official_meta", owner_id: id };
  }
  return { mode: "official_meta", owner_id: candidates[0] ?? null };
}

/**
 * Meta rejects template parameters that are empty or contain newlines, tabs or
 * runs of 4+ spaces — such a send fails (or gets dropped) even though the API
 * may hand back a wamid. Normalize every value before it goes on the wire.
 */
function sanitizeTemplateParam(value: string): string {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{4,}/g, "   ")
    .trim()
    .slice(0, 1024);
}

/**
 * Build the Meta `components` payload for an approved template.
 *
 * Supports both positional ({{1}}) and named ({{first_name}}) placeholders —
 * named ones require `parameter_name` per Meta's Cloud API spec.
 * Returns the missing placeholder names so the caller can fail loudly instead
 * of shipping empty parameters that Meta silently refuses to deliver.
 */
function buildTemplateComponents(
  bodyText: string,
  values: Record<string, string>,
): { components: unknown[]; missing: string[] } {
  const keys: string[] = [];
  const re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bodyText)) !== null) {
    if (!keys.includes(m[1])) keys.push(m[1]);
  }
  if (!keys.length) return { components: [], missing: [] };
  const missing: string[] = [];
  const parameters = keys.map((key) => {
    const text = sanitizeTemplateParam(values[key] ?? values[key.toLowerCase()] ?? "");
    if (!text) missing.push(key);
    return /^\d+$/.test(key)
      ? { type: "text", text }
      : { type: "text", parameter_name: key, text };
  });
  return { components: [{ type: "body", parameters }], missing };
}


/**
 * Collect the dynamic values a template may reference: lead name, property
 * address and the workspace's business name — merged with caller overrides.
 */
async function buildTemplateVariables(
  admin: ReturnType<typeof createClient>,
  opts: {
    leadId?: string | null;
    listingId?: string | null;
    ownerId?: string | null;
    overrides?: Record<string, string>;
  },
): Promise<Record<string, string>> {
  const values: Record<string, string> = {};

  let leadName = "";
  let listingId = opts.listingId ?? null;
  if (opts.leadId) {
    const { data: lead } = await admin
      .from("leads")
      .select("full_name, city, linked_listing_id")
      .eq("id", opts.leadId)
      .maybeSingle();
    leadName = String((lead as any)?.full_name ?? "");
    listingId = listingId ?? ((lead as any)?.linked_listing_id ?? null);
  }

  let address = "";
  if (listingId) {
    const { data: listing } = await admin
      .from("listings")
      .select("address, house_number, apartment_number, city, property_title")
      .eq("id", listingId)
      .maybeSingle();
    const l = (listing ?? {}) as any;
    if (l) {
      const street = [l.address, l.house_number].filter(Boolean).join(" ").trim();
      address = [street, l.city].filter(Boolean).join(", ") || String(l.property_title ?? "");
    }
  }

  let businessName = "";
  if (opts.ownerId) {
    const { data: brand } = await admin
      .from("white_label_settings")
      .select("agency_name")
      .eq("user_id", opts.ownerId)
      .maybeSingle();
    businessName = String((brand as any)?.agency_name ?? "");
    if (!businessName) {
      const { data: prof } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", opts.ownerId)
        .maybeSingle();
      businessName = String((prof as any)?.full_name ?? "");
    }
  }

  const first = leadName.trim().split(/\s+/)[0] ?? "";
  const assign = (keys: string[], value: string) => {
    if (!value) return;
    for (const k of keys) values[k] = value;
  };
  assign(["lead_name", "name", "full_name", "customer_name", "client_name"], leadName);
  assign(["first_name", "firstname"], first || leadName);
  assign(["property_address", "address", "property", "listing_address"], address);
  assign(["business_name", "agency_name", "company_name", "broker_name"], businessName);

  // Caller-supplied values always win.
  for (const [k, v] of Object.entries(opts.overrides ?? {})) {
    if (v != null && v !== "") values[k] = v;
  }

  // Positional fallback: {{1}}, {{2}}, {{3}} → lead name, address, business.
  const positional = [values.lead_name ?? first, values.property_address ?? "", values.business_name ?? ""];
  positional.forEach((v, i) => {
    const key = String(i + 1);
    if (values[key] == null && v) values[key] = v;
  });

  return values;
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
  const apiVersion = String(cfg.api_version ?? "v26.0");
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
        "Content-Type": "application/json; charset=utf-8",
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
        "Content-Type": "application/json; charset=utf-8",
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
    case 131058:
      return {
        category: "template",
        hebrew:
          "התבנית hello_world נתמכת רק במספרי הבדיקה של Meta. מהמספר העסקי שלך יש לשלוח תבנית מאושרת משלך (סנכרן תבניות בהגדרות ובחר אחת מהן)",
      };
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
      // NOTE: leads has no `user_id` column — the workspace owner is `assigned_to`.
      // Selecting a non-existent column made EVERY lead_id-based send fail with
      // "Lead not found", which silently killed the AI autopilot replies.
      const { data: lead, error: leadErr } = await admin
        .from("leads")
        .select("phone_number, assigned_to")
        .eq("id", parsed.data.lead_id)
        .maybeSingle();
      if (leadErr || !lead?.phone_number) {
        return json({
          success: false,
          provider: "WBA",
          message_id: null,
          error: leadErr
            ? `Lead lookup failed: ${leadErr.message}`
            : "Lead not found or has no phone_number",
        }, 404);
      }
      rawPhone = lead.phone_number;
      routingTenantId = routingTenantId ?? ((lead as any)?.assigned_to ?? null);
    } else if (parsed.data.lead_id && !routingTenantId) {
      const { data: lead } = await admin
        .from("leads")
        .select("assigned_to")
        .eq("id", parsed.data.lead_id)
        .maybeSingle();
      routingTenantId = ((lead as any)?.assigned_to ?? null) as string | null;
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

    // Owning workspace (credentials + logging). Transport is always Meta Cloud.
    const routing = await resolveWorkspaceOwner(admin, userId, routingTenantId);

    // ARCHITECTURE (HARD): WhatsApp messaging is Meta Cloud API only. There is
    // no alternative gateway and no fallback transport — every outbound message
    // (free text, media, approved template) leaves through graph.facebook.com.
    const provider = await resolveProvider(admin, userId, routingTenantId, true);

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

    // Template dispatch. When the caller didn't pre-build `components`, we
    // look up the approved template body from the synced cache and map the
    // dynamic variables (lead name, property address, business name) into the
    // Meta payload before sending.
    let template:
      | { id: string; language?: string; components?: unknown[] }
      | undefined;
    if (parsed.data.template_id) {
      let language = parsed.data.template_language;
      let components = parsed.data.template_components;

      if (!components || components.length === 0) {
        let bodyText = "";
        const tplQuery = admin
          .from("wa_message_templates")
          .select("name, language, body_text, owner_user_id")
          .eq("name", parsed.data.template_id)
          .order("synced_at", { ascending: false })
          .limit(10);
        const { data: tplRows } = await tplQuery;
        const rows = (tplRows ?? []) as any[];
        const sameLang = language ? rows.filter((r) => String(r.language) === language) : [];
        const pool = sameLang.length ? sameLang : rows;
        const row =
          pool.find((r) => routing.owner_id && r.owner_user_id === routing.owner_id) ?? pool[0];
        if (row) {
          bodyText = String(row.body_text ?? "");
          // The approved template's own language ALWAYS wins. Guessing "he" for
          // a template that Meta only approved in "en" makes the Cloud API
          // reject the send (132001) or drop it after handing back a wamid.
          language = String(row.language ?? language ?? "he");
        }

        if (bodyText && /\{\{\s*[A-Za-z0-9_]+\s*\}\}/.test(bodyText)) {
          const values = await buildTemplateVariables(admin, {
            leadId: parsed.data.lead_id ?? null,
            listingId: parsed.data.listing_id ?? null,
            ownerId: routing.owner_id,
            overrides: parsed.data.template_variables,
          });
          const built = buildTemplateComponents(bodyText, values);
          if (built.missing.length) {
            return json({
              success: false,
              provider: "WBA",
              message_id: null,
              error: `חסרים משתנים בתבנית "${parsed.data.template_id}": ${built.missing.join(", ")}`,
              details: { missing_variables: built.missing, template: parsed.data.template_id },
            }, 400);
          }
          components = built.components;
        }
      }

      template = {
        id: parsed.data.template_id,
        language,
        components,
      };
    }



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
        await admin.rpc("record_interaction_message", {
          _lead_id: parsed.data.lead_id,
          _platform: "whatsapp",
          _direction: "outbound",
          _sender_type: parsed.data.ai_assisted ? "ai" : "agent",
          _content: outboundMessage,
          _external_id: result.message_id || `send-whatsapp:${crypto.randomUUID()}`,
          _created_at: new Date().toISOString(),
          _metadata: {
            provider: effectiveProvider,
            message_id: result.message_id,
            status: "sent",
            ai_assisted: !!parsed.data.ai_assisted,
            disclosure_appended: disclosureAppended,
          },
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
        connection_mode: routing.mode,
        creds_source: provider?.source,
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

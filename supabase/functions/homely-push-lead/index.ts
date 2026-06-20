// Push a Realtyz lead to Homely's "Open Card" CRM API.
// Triggered automatically (via DB trigger -> pg_net) on lead INSERT, OR
// invoked manually by an authenticated user via supabase.functions.invoke.
//
// Spec: https://webtiv.co.il/welcome/OpenCardApi.html
// Endpoint: POST https://webtivapi.webtiv.co.il/api/WebtivLid/WebtivLidPost
// Headers:  Content-Type: application/json

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const HOMELY_URL = "https://webtivapi.webtiv.co.il/api/WebtivLid/WebtivLidPost";
const PROVIDER = "RealtyZ";

// Allowed Webtiv category values (exact, case-sensitive Hebrew strings).
const ALLOWED_CATEGORIES = new Set([
  "מוכר",
  "קונה",
  "שוכר",
  "מסחרי היצע",
  "מסחרי ביקוש",
]);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Map deal_type + interest_tag to one of Homely's required category values.
function inferCategory(lead: Record<string, any>, override?: string | null): string {
  if (override && ALLOWED_CATEGORIES.has(override.trim())) return override.trim();
  const tag = String(lead.interest_tag || "").toLowerCase();
  const deal = String(lead.deal_type || "sale").toLowerCase();

  if (/(seller|מוכר|למכירה.*בעלים)/.test(tag)) return "מוכר";
  if (/(commercial|מסחר)/.test(tag)) {
    return deal === "rent" ? "מסחרי ביקוש" : "מסחרי היצע";
  }
  if (/(rent|שוכר|להשכרה|שכירות)/.test(tag)) return "שוכר";
  if (/(buyer|קונה|לקנות|invest|השקע)/.test(tag)) return "קונה";

  return deal === "rent" ? "שוכר" : "קונה";
}

// Split "First Last" into { name, family }. Webtiv expects them separately.
function splitName(full: string): { name: string; family: string } {
  const parts = String(full || "").trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return { name: "—", family: "" };
  if (parts.length === 1) return { name: parts[0], family: "" };
  return { name: parts[0], family: parts.slice(1).join(" ") };
}

// Convert Realtyz internal phone (9725XXXXXXXX) to local 0XXXXXXXXX format.
function denormalizePhone(p: string): string {
  const d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("972")) return "0" + d.slice(3);
  return d;
}

function strOrUndef(v: unknown): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  return String(v);
}

function boolOrUndef(v: unknown): boolean | undefined {
  if (v === true || v === false) return v;
  if (v === "true" || v === 1 || v === "1") return true;
  if (v === "false" || v === 0 || v === "0") return false;
  return undefined;
}

async function pushLead(params: {
  admin: ReturnType<typeof createClient>;
  leadId: string;
  ownerId: string;
  categoryOverride?: string | null;
}): Promise<{ ok: boolean; status: number; body: unknown; error?: string; category?: string; payload?: unknown }> {
  const { admin, leadId, ownerId, categoryOverride } = params;

  // Load credentials
  const { data: cred } = await admin
    .from("user_api_keys")
    .select("homely_client_code, homely_default_agent")
    .eq("user_id", ownerId)
    .maybeSingle();

  const client = (cred as any)?.homely_client_code;
  if (!client) {
    return { ok: false, status: 0, body: null, error: "missing_homely_client_code" };
  }

  // Load lead
  const { data: lead, error: leadErr } = await admin
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr || !lead) return { ok: false, status: 0, body: null, error: "lead_not_found" };

  const category = inferCategory(lead as any, categoryOverride);
  if (!ALLOWED_CATEGORIES.has(category)) {
    return { ok: false, status: 0, body: null, error: `invalid_category:${category}` };
  }

  const prefs = ((lead as any).preferences || {}) as Record<string, any>;
  const { name, family } = splitName((lead as any).full_name || "");
  const phone = denormalizePhone((lead as any).phone_number);
  const email = strOrUndef((lead as any).email);

  // Required: phone OR email
  if (!phone && !email) {
    return { ok: false, status: 0, body: null, error: "missing_phone_and_email" };
  }

  const price =
    prefs.max_price ?? prefs.budget_max ?? prefs.budget ?? prefs.price ?? prefs.asking_price;

  // Street/number only relevant for sellers (category "מוכר")
  const isSeller = category === "מוכר";

  // Exact Webtiv key mapping (case-sensitive, no spaces).
  const payload: Record<string, unknown> = {
    client,
    provider: PROVIDER,
    category,
    name,
    family,
    phone: phone || undefined,
    email,
    price: strOrUndef(price),
    city: strOrUndef((lead as any).city ?? prefs.city),
    neighborhood: strOrUndef((lead as any).neighborhood ?? prefs.neighborhood),
    street: isSeller ? strOrUndef(prefs.street) : undefined,
    number: isSeller ? strOrUndef(prefs.street_number ?? prefs.number) : undefined,
    propertyType: strOrUndef(prefs.property_type ?? prefs.propertyType),
    rooms: strOrUndef(prefs.rooms),
    floor: strOrUndef(prefs.floor),
    builtsqmr: strOrUndef(prefs.sqm ?? prefs.built_sqm ?? prefs.builtsqmr),
    remark: strOrUndef((lead as any).interest_tag),
    agent: strOrUndef((cred as any)?.homely_default_agent),
    publishID: strOrUndef(prefs.publishID ?? prefs.publish_id),
    cardID: strOrUndef(prefs.cardID ?? prefs.card_id ?? (lead as any).id),
    mirpesetShemeshYN: boolOrUndef(prefs.mirpesetShemeshYN ?? prefs.sun_balcony),
    mamadYN: boolOrUndef(prefs.mamadYN ?? prefs.secure_room ?? prefs.mamad),
  };
  // Strip undefined
  for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];

  const upstream = await fetch(HOMELY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let parsed: unknown = null;
  const text = await upstream.text();
  try { parsed = JSON.parse(text); } catch { parsed = text; }

  // Webtiv often returns HTTP 200 with { success: false, errorMessage } in the body.
  // Treat that as a real failure so the UI surfaces the actual reason.
  const bodyObj = (parsed && typeof parsed === "object") ? parsed as Record<string, unknown> : null;
  const bodySuccess = bodyObj ? (bodyObj.success !== false) : true;
  const bodyError = bodyObj
    ? String(bodyObj.errorMessage ?? bodyObj.error ?? "")
    : (typeof parsed === "string" ? parsed : "");
  const effectiveOk = upstream.ok && bodySuccess;

  await admin.from("homely_push_log").insert({
    lead_id: leadId,
    user_id: ownerId,
    status: effectiveOk ? "success" : "failed",
    http_status: upstream.status,
    category,
    request: payload,
    response: typeof parsed === "string" ? { text: parsed } : (parsed as any),
    error: effectiveOk ? null : (bodyError || `HTTP ${upstream.status}`),
  });

  if (!effectiveOk) {
    await logIntegrationError({
      integration: "homely",
      functionName: "homely-push-lead",
      errorCode: upstream.status,
      errorMessage: bodyError || (typeof parsed === "string" ? parsed : JSON.stringify(parsed)),
      context: { lead_id: leadId, client },
    });
  }

  return {
    ok: effectiveOk,
    status: upstream.status,
    body: parsed,
    category,
    payload,
    error: effectiveOk ? undefined : (bodyError || `HTTP ${upstream.status}`),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const leadId = (body as any)?.lead_id as string | undefined;
    const categoryOverride = (body as any)?.category as string | undefined;
    let ownerId = (body as any)?.owner_id as string | undefined;

    if (!leadId) return json({ error: "lead_id required" }, 400);

    if (!ownerId) {
      const auth = req.headers.get("Authorization") || "";
      if (auth.startsWith("Bearer ")) {
        const userClient = createClient(SUPABASE_URL, ANON_KEY, {
          global: { headers: { Authorization: auth } },
        });
        const { data: { user } } = await userClient.auth.getUser();
        if (user) ownerId = user.id;
      }
    }
    if (!ownerId) {
      const { data: l } = await admin.from("leads").select("assigned_to").eq("id", leadId).maybeSingle();
      ownerId = (l as any)?.assigned_to;
    }
    if (!ownerId) return json({ error: "could_not_resolve_owner" }, 400);

    const result = await pushLead({ admin, leadId, ownerId, categoryOverride });
    // Soft-fail config/validation issues with 200 so DB triggers and frontend don't crash.
    const softFail = !result.ok && (
      result.error === "missing_homely_client_code" ||
      result.error === "missing_phone_and_email" ||
      result.error === "lead_not_found" ||
      (typeof result.error === "string" && result.error.startsWith("invalid_category:"))
    );
    return json({ ...result, skipped: softFail || undefined, fallback: softFail || undefined }, result.ok || softFail ? 200 : 502);
  } catch (e) {
    console.error("[homely-push-lead] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});

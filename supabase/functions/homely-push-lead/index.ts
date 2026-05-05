// Push a Realtyz lead to Homely's "Open Card" CRM API.
// Triggered automatically (via DB trigger -> pg_net) on lead INSERT, OR
// invoked manually by an authenticated user via supabase.functions.invoke.
//
// Spec: https://webtiv.co.il/welcome/OpenCardApi.html
// Endpoint: POST https://webtivapi.webtiv.co.il/api/WebtivLid/WebtivLidPost

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const HOMELY_URL = "https://webtivapi.webtiv.co.il/api/WebtivLid/WebtivLidPost";

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
function inferCategory(lead: Record<string, any>, override?: string | null): {
  category: string;
  ambiguous: boolean;
} {
  if (override && override.trim()) return { category: override.trim(), ambiguous: false };
  const tag = String(lead.interest_tag || "").toLowerCase();
  const stage = String(lead.lead_stage || "").toLowerCase();
  const deal = String(lead.deal_type || "sale").toLowerCase();

  // Explicit signals from interest_tag (Hebrew or English)
  if (/(seller|מוכר|למכירה.*בעלים)/.test(tag)) return { category: "מוכר", ambiguous: false };
  if (/(invest|השקע)/.test(tag)) return { category: "קונה", ambiguous: true }; // investors usually buy
  if (/(commercial|מסחר)/.test(tag)) {
    return { category: deal === "rent" ? "מסחרי ביקוש" : "מסחרי היצע", ambiguous: true };
  }
  if (/(plot|מגרש|קרקע)/.test(tag)) {
    return { category: deal === "rent" ? "מגרשים ביקוש" : "מגרשים היצע", ambiguous: true };
  }
  if (/(rent|שוכר|להשכרה|שכירות)/.test(tag)) return { category: "שוכר", ambiguous: false };
  if (/(buyer|קונה|לקנות)/.test(tag)) return { category: "קונה", ambiguous: false };

  // Fallback: deal_type
  return { category: deal === "rent" ? "שוכר" : "קונה", ambiguous: false };
}

// Convert Realtyz internal phone (9725XXXXXXXX) back to a friendly local format
// Homely's docs show "03-1234567" — they accept various formats. We'll send 0XX-XXXXXXX.
function denormalizePhone(p: string): string {
  const d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("972")) return "0" + d.slice(3);
  return d;
}

async function pushLead(params: {
  admin: ReturnType<typeof createClient>;
  leadId: string;
  ownerId: string;
  categoryOverride?: string | null;
}): Promise<{ ok: boolean; status: number; body: unknown; error?: string; category?: string }> {
  const { admin, leadId, ownerId, categoryOverride } = params;

  // Load credentials
  const { data: cred } = await admin
    .from("user_api_keys")
    .select("homely_client_code, homely_provider, homely_default_agent")
    .eq("user_id", ownerId)
    .maybeSingle();

  if (!cred?.homely_client_code) {
    return { ok: false, status: 0, body: null, error: "missing_homely_client_code" };
  }

  // Load lead
  const { data: lead, error: leadErr } = await admin
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr || !lead) return { ok: false, status: 0, body: null, error: "lead_not_found" };

  const { category } = inferCategory(lead as any, categoryOverride);
  const prefs = (lead as any).preferences || {};

  const payload: Record<string, unknown> = {
    client: cred.homely_client_code,
    provider: cred.homely_provider || "Realtyz",
    category,
    name: lead.full_name || "—",
    phone: denormalizePhone(lead.phone_number),
    email: lead.email || undefined,
    city: lead.city || prefs.city || undefined,
    neighborhood: lead.neighborhood || prefs.neighborhood || undefined,
    rooms: prefs.rooms ? String(prefs.rooms) : undefined,
    price: prefs.max_price || prefs.budget_max || prefs.budget
      ? String(prefs.max_price || prefs.budget_max || prefs.budget)
      : undefined,
    propertyType: prefs.property_type || undefined,
    floor: prefs.floor ? String(prefs.floor) : undefined,
    builtsqmr: prefs.sqm || prefs.built_sqm ? String(prefs.sqm || prefs.built_sqm) : undefined,
    remark: lead.interest_tag || undefined,
    agent: cred.homely_default_agent || undefined,
  };
  // Strip undefined
  for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];

  const upstream = await fetch(HOMELY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  let parsed: unknown = null;
  const text = await upstream.text();
  try { parsed = JSON.parse(text); } catch { parsed = text; }

  // Log result
  await admin.from("homely_push_log").insert({
    lead_id: leadId,
    user_id: ownerId,
    status: upstream.ok ? "success" : "failed",
    http_status: upstream.status,
    category,
    request: payload,
    response: typeof parsed === "string" ? { text: parsed } : (parsed as any),
    error: upstream.ok ? null : `HTTP ${upstream.status}`,
  });

  if (!upstream.ok) {
    await logIntegrationError({
      integration: "homely",
      functionName: "homely-push-lead",
      errorCode: upstream.status,
      errorMessage: typeof parsed === "string" ? parsed : JSON.stringify(parsed),
      context: { lead_id: leadId },
    });
  }

  return { ok: upstream.ok, status: upstream.status, body: parsed, category };
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

    // If no owner_id in body (manual invoke from frontend), derive from JWT.
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
      // Last resort: pull lead.assigned_to
      const { data: l } = await admin.from("leads").select("assigned_to").eq("id", leadId).maybeSingle();
      ownerId = (l as any)?.assigned_to;
    }
    if (!ownerId) return json({ error: "could_not_resolve_owner" }, 400);

    const result = await pushLead({ admin, leadId, ownerId, categoryOverride });
    return json(result, result.ok ? 200 : 502);
  } catch (e) {
    console.error("[homely-push-lead] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});

// Homely Leads Importer
//
// Fetches lead leads from Homely. If the user has connected a real Homely
// API key (stored in `user_api_keys.homely_api_key`) we attempt the real API;
// otherwise we return a typed mock dataset so the rest of the product can be
// built and demoed end-to-end. When real Homely credentials are available the
// only thing that needs to change is the `fetchHomelyLeads` function.
//
// Request body:
//   { dry_run?: boolean }
//
// Returns:
//   { source: "homely" | "mock", imported: number, leads: HomelyLead[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type HomelyLead = {
  external_id: string;
  full_name: string;
  phone_number: string;
  email: string | null;
  city: string | null;
  interest_tag: string | null;
  preferences: Record<string, unknown>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Israeli phone normalizer → 9725XXXXXXXX
function normalizePhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return digits;
}

const MOCK_LEADS: HomelyLead[] = [
  { external_id: "homely-9001", full_name: "דנה לוי",      phone_number: "0541234501", email: "dana.l@example.co.il",  city: "תל אביב",   interest_tag: "דירת 4 חדרים", preferences: { rooms: 4, max_price: 3200000, city: "תל אביב" } },
  { external_id: "homely-9002", full_name: "אורי כהן",     phone_number: "0541234502", email: null,                    city: "רמת גן",    interest_tag: "דופלקס",        preferences: { rooms: 5, max_price: 4500000, city: "רמת גן" } },
  { external_id: "homely-9003", full_name: "מאיה ברק",     phone_number: "0541234503", email: "maya.b@example.co.il",  city: "הרצליה",    interest_tag: "פנטהאוז",       preferences: { rooms: 5, min_price: 5000000, city: "הרצליה" } },
  { external_id: "homely-9004", full_name: "יואב פרץ",     phone_number: "0541234504", email: null,                    city: "באר שבע",   interest_tag: "דירת 3 חדרים", preferences: { rooms: 3, max_price: 1200000 } },
  { external_id: "homely-9005", full_name: "שירה גולן",    phone_number: "0541234505", email: "shira.g@example.co.il", city: "ירושלים",   interest_tag: "גן עדן",        preferences: { rooms: 4, garden: true, city: "ירושלים" } },
  { external_id: "homely-9006", full_name: "אלון ניר",     phone_number: "0541234506", email: null,                    city: "פתח תקווה", interest_tag: "השקעה",         preferences: { investment: true, max_price: 1800000 } },
  { external_id: "homely-9007", full_name: "נועה שמיר",    phone_number: "0541234507", email: "noa.s@example.co.il",   city: "חיפה",      interest_tag: "דירת 4 חדרים", preferences: { rooms: 4, max_price: 1900000, city: "חיפה" } },
  { external_id: "homely-9008", full_name: "אבי טל",       phone_number: "0541234508", email: null,                    city: "כפר סבא",   interest_tag: "קוטג'",         preferences: { rooms: 5, garden: true, city: "כפר סבא" } },
];

async function fetchHomelyLeads(apiKey: string): Promise<HomelyLead[] | null> {
  // Real Homely API call — endpoint name + auth header are best-guess; replace
  // with the documented spec when you have it. Returning null tells the caller
  // to fall back to the mock dataset.
  try {
    const url = "https://api.homely.com/v1/leads";
    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
    if (!upstream.ok) {
      console.warn("[homely-leads] upstream", upstream.status);
      return null;
    }
    const payload = await upstream.json().catch(() => null);
    const items: any[] = Array.isArray(payload) ? payload : payload?.data ?? payload?.leads ?? [];
    if (!items.length) return null;
    return items.map((it: any, i: number) => ({
      external_id: String(it?.id ?? `homely-${i}`),
      full_name: it?.full_name ?? it?.name ?? "—",
      phone_number: normalizePhone(it?.phone ?? it?.phone_number ?? ""),
      email: it?.email ?? null,
      city: it?.city ?? null,
      interest_tag: it?.interest ?? it?.tag ?? null,
      preferences: (it?.preferences as Record<string, unknown>) ?? {},
    }));
  } catch (e) {
    console.warn("[homely-leads] homely fetch failed:", (e as Error).message);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean((body as any)?.dry_run);

    // Fetch real Homely first if a key is configured.
    let source: "homely" | "mock" = "mock";
    let leads: HomelyLead[] = MOCK_LEADS;

    const { data: keyRow } = await admin
      .from("user_api_keys")
      .select("homely_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (keyRow?.homely_api_key) {
      const real = await fetchHomelyLeads(keyRow.homely_api_key);
      if (real && real.length) {
        source = "homely";
        leads = real;
      }
    }

    if (dryRun) {
      return json({ source, imported: 0, leads });
    }

    // Upsert into `leads`. We use phone_number as the natural key — any lead
    // already in the table is skipped (no duplicates). RLS does not apply for
    // service-role inserts, so we tag ownership explicitly via assigned_to.
    let imported = 0;
    for (const p of leads) {
      const phone = normalizePhone(p.phone_number);
      if (!phone) continue;

      const { data: existing } = await admin
        .from("leads")
        .select("id")
        .eq("phone_number", phone)
        .maybeSingle();
      if (existing) continue;

      const { error: insErr } = await admin.from("leads").insert({
        phone_number: phone,
        full_name: p.full_name,
        email: p.email,
        city: p.city,
        interest_tag: p.interest_tag,
        preferences: p.preferences as any,
        lead_stage: "new_lead",
        assigned_to: user.id,
        is_demo: false,
      });
      if (!insErr) imported += 1;
      else console.warn("[homely-leads] insert failed:", insErr.message);
    }

    return json({ source, imported, leads });
  } catch (e) {
    console.error("[homely-leads] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});

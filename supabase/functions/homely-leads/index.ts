// Homely (Webtiv) Leads Importer — real data only.
//
// The Webtiv REST API (/api/WebtivLid/*, /api/Lid/*, /api/Leads/*, /api/Contacts/*)
// does NOT exist on webtivapi.webtiv.co.il — every variant returns HTML 404.
// Login at /api/login/LoginNewByAgent succeeds but returns NO token, only a
// `db` id + agent metadata. The only live data channel on this host is the
// AutomaionJson stream feed:
//   https://webtivapi.webtiv.co.il/AutomaionJson/outJson.ashx?guid=<GUID>
//
// Each broker has two stream GUIDs stored in `webtiv_sync_state`
// (buyers_guid / sellers_guid). This function:
//   1. loads the broker's two GUIDs,
//   2. fetches both streams,
//   3. maps records → leads,
//   4. dedups against existing leads by normalized phone,
//   5. upserts new rows into `public.leads` assigned to the calling user.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STREAM_BASE = "https://webtivapi.webtiv.co.il/AutomaionJson/outJson.ashx";

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

function normalizePhone(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return digits;
}

function firstPhone(rec: Record<string, unknown>): string {
  for (const k of ["tel1", "tel2", "tel3", "tel4", "tel5", "phone", "Pelephone", "telephone"]) {
    const v = normalizePhone(rec[k]);
    if (v && v.length >= 11) return v;
  }
  return "";
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

async function fetchStream(guid: string): Promise<any[]> {
  try {
    const url = `${STREAM_BASE}?guid=${encodeURIComponent(guid)}`;
    const r = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Realtyz-Homely/1.0" },
    });
    const text = await r.text();
    console.log(`[HOMELY-STREAM] guid=${guid.slice(0, 8)}… status=${r.status} bytes=${text.length} preview=${text.slice(0, 200)}`);
    if (!r.ok) return [];
    let payload: any = null;
    try { payload = JSON.parse(text); } catch {
      console.warn(`[HOMELY-STREAM] non-JSON for guid=${guid.slice(0, 8)}…`);
      return [];
    }
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object") {
      console.log(`[HOMELY-STREAM-KEYS] guid=${guid.slice(0, 8)}…`, Object.keys(payload));
      const candidates = ["data", "rows", "result", "results", "items", "Items", "leads", "Leads", "records", "Records", "lidim", "Lidim", "list", "List"];
      for (const k of candidates) {
        if (Array.isArray((payload as any)[k])) return (payload as any)[k];
      }
    }
    return [];
  } catch (e) {
    console.warn("[HOMELY-STREAM] fetch failed:", (e as Error).message);
    return [];
  }
}

function mapRecord(rec: Record<string, any>, source: "buyers" | "sellers", idx: number): HomelyLead | null {
  const phone = firstPhone(rec);
  const email = strOrNull(rec.email ?? rec.Email);
  if (!phone && !email) return null;

  const name = strOrNull(rec.name ?? rec.Name ?? rec.shemMale) ?? "";
  const family = strOrNull(rec.family ?? rec.Family ?? rec.lastName) ?? "";
  const fullName = `${name} ${family}`.trim() || "—";

  const city = strOrNull(rec.city ?? rec.city1 ?? rec.ir ?? rec.Ir);
  const tag = source === "sellers" ? "מוכר" : "קונה";

  return {
    external_id: String(rec.serial ?? rec.Serial ?? rec.id ?? rec.Id ?? `webtiv-${source}-${idx}`),
    full_name: fullName,
    phone_number: phone,
    email,
    city,
    interest_tag: tag,
    preferences: {
      source: "webtiv_stream",
      stream: source,
      neighborhood: strOrNull(rec.shcuna ?? rec.shcuna1),
      property_type: strOrNull(rec.objectresidence),
      rooms: strOrNull(rec.room),
      floor: strOrNull(rec.floor),
      built_sqm: strOrNull(rec.builtsqmr),
      price: strOrNull(rec.priceshekel),
      agent: strOrNull(rec.agent),
      raw: rec,
    },
  };
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

    // Load broker's stream GUIDs
    const { data: state } = await admin
      .from("webtiv_sync_state")
      .select("buyers_guid, sellers_guid")
      .eq("user_id", user.id)
      .maybeSingle();

    const buyersGuid = (state as any)?.buyers_guid as string | null;
    const sellersGuid = (state as any)?.sellers_guid as string | null;

    if (!buyersGuid && !sellersGuid) {
      return json({
        source: "homely",
        connected: false,
        imported: 0,
        leads: [],
        note: "no_stream_guids — configure buyers_guid/sellers_guid in webtiv_sync_state",
      });
    }

    const collected: HomelyLead[] = [];
    const seen = new Set<string>();
    const sources: Array<{ key: "buyers" | "sellers"; guid: string | null }> = [
      { key: "buyers", guid: buyersGuid },
      { key: "sellers", guid: sellersGuid },
    ];
    for (const s of sources) {
      if (!s.guid) continue;
      const records = await fetchStream(s.guid);
      console.log(`[HOMELY-STREAM] ${s.key}: ${records.length} records`);
      records.forEach((rec, i) => {
        const m = mapRecord(rec, s.key, i);
        if (!m) return;
        const key = m.phone_number || m.email || m.external_id;
        if (key && seen.has(key)) return;
        if (key) seen.add(key);
        collected.push(m);
      });
    }

    if (dryRun) return json({ source: "homely", connected: true, imported: 0, leads: collected });

    let imported = 0;
    for (const p of collected) {
      const phone = p.phone_number;
      if (!phone) continue;
      const { data: existing } = await admin
        .from("leads").select("id").eq("phone_number", phone).maybeSingle();
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

    return json({ source: "homely", connected: true, imported, leads: collected });
  } catch (e) {
    console.error("[homely-leads] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});

// Homely (Webtiv) Leads Importer — real data only.
//
// Pulls live JSON from the AutomaionJson stream feed:
//   https://webtivapi.webtiv.co.il/AutomaionJson/outJson.ashx?guid=<GUID>
// (Webtiv has no working REST endpoints — every /api/* variant returns HTML 404.)
//
// Each broker has two stream GUIDs stored in `webtiv_sync_state`
// (buyers_guid / sellers_guid). If the row is missing, we auto-seed the
// public sample GUIDs the dashboard ships with so first-run actually returns
// data; the broker can override these later in Settings.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STREAM_BASE = "https://webtivapi.webtiv.co.il/AutomaionJson/outJson.ashx";
const DEFAULT_BUYERS_GUID = "b6bb7f44-571b-4551-8de9-e075b8a89128";
const DEFAULT_SELLERS_GUID = "32dc79a4-88ba-49a4-816e-f1fc43024c2f";

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

// Strip every non-digit, then normalize to leading 0 if it looks Israeli (+972 / 972).
function cleanPhone(raw: unknown): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("972")) d = "0" + d.slice(3);
  return d;
}

// Scan a wide list of common/localized key variants for the first usable phone.
function pickPhone(rec: Record<string, any>): string {
  const variants = [
    rec.Phone1, rec.phone1, rec.tel1,
    rec.Phone, rec.phone,
    rec.Mobile, rec.mobile,
    rec.Cellular, rec.cellular,
    rec.tel2, rec.tel3, rec.tel4, rec.tel5,
    rec.Pelephone, rec.telephone,
    rec["טלפון"], rec["נייד"], rec["סלולרי"],
  ];
  for (const v of variants) {
    const c = cleanPhone(v);
    if (c && c.length >= 9) return c;
  }
  return "";
}

function pickName(rec: Record<string, any>): string {
  const name = rec.Fullname || rec.fullname || rec.FullName
    || rec.name || rec.Name || rec.ContactName
    || rec["שם"] || rec["שם מלא"]
    || [rec.name, rec.family].filter(Boolean).join(" ").trim()
    || [rec.Name, rec.Family].filter(Boolean).join(" ").trim();
  const s = String(name ?? "").trim();
  return s || "לקוח הומלי";
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

async function fetchStream(guid: string, label: string): Promise<any[]> {
  try {
    const url = `${STREAM_BASE}?guid=${encodeURIComponent(guid)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Realtyz-Homely/1.0" },
    });
    const status = res.status;
    const raw = await res.clone().text();
    console.log(`[STREAM-RAW-RESPONSE] ${label} status=${status} bytes=${raw.length} preview=${raw.substring(0, 600)}`);
    if (!res.ok) {
      console.error(`[STREAM-FETCH-ERROR] ${label} status=${status}`);
      return [];
    }

    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch (e) {
      console.error(`[STREAM-PARSE-ERROR] ${label}:`, (e as Error).message);
      return [];
    }

    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      console.log(`[STREAM-KEYS] ${label}:`, Object.keys(parsed));
      const envelopes = ["Data", "data", "Root", "root", "rows", "Rows", "result", "Result", "results", "Results", "items", "Items", "leads", "Leads", "records", "Records", "lidim", "Lidim", "list", "List"];
      for (const k of envelopes) {
        if (Array.isArray((parsed as any)[k])) return (parsed as any)[k];
      }
    }
    console.warn(`[STREAM-NO-ARRAY] ${label} — could not locate a records array`);
    return [];
  } catch (e) {
    console.error(`[STREAM-FETCH-CRASH] ${label}:`, (e as Error).message);
    return [];
  }
}

function mapRecord(rec: Record<string, any>, source: "buyers" | "sellers", idx: number): HomelyLead | null {
  const phone = pickPhone(rec);
  const email = strOrNull(rec.email ?? rec.Email);
  if (!phone && !email) return null;

  const fullName = pickName(rec);
  const city = strOrNull(rec.city ?? rec.City ?? rec.city1 ?? rec.ir ?? rec.Ir ?? rec["עיר"]);
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

    // 1) Validate GUID retrieval
    let { data: state } = await admin
      .from("webtiv_sync_state")
      .select("buyers_guid, sellers_guid")
      .eq("user_id", user.id)
      .maybeSingle();

    let buyerGuid = (state as any)?.buyers_guid as string | null;
    let sellerGuid = (state as any)?.sellers_guid as string | null;
    console.log("[STREAM-GUID-CHECK]:", { user_id: user.id, buyerGuid, sellerGuid });

    // Auto-seed defaults if missing so first-run still ingests
    if (!state) {
      console.log("[STREAM-GUID-SEED]: inserting default GUIDs for", user.id);
      await admin.from("webtiv_sync_state").insert({
        user_id: user.id,
        buyers_guid: DEFAULT_BUYERS_GUID,
        sellers_guid: DEFAULT_SELLERS_GUID,
        enabled: true,
      });
      buyerGuid = DEFAULT_BUYERS_GUID;
      sellerGuid = DEFAULT_SELLERS_GUID;
    } else if (!buyerGuid && !sellerGuid) {
      console.warn("[STREAM-GUID-MISSING]: row exists but both GUIDs are null");
      return json({
        source: "homely",
        connected: false,
        imported: 0,
        leads: [],
        note: "missing_guids",
        error: "תצורת סנכרון Webtiv חסרה — אין GUID של קונים/מוכרים. עדכן בהגדרות.",
      });
    }

    // 2) Fetch each stream and map
    const collected: HomelyLead[] = [];
    const seen = new Set<string>();
    const sources: Array<{ key: "buyers" | "sellers"; guid: string | null }> = [
      { key: "buyers", guid: buyerGuid },
      { key: "sellers", guid: sellerGuid },
    ];

    for (const s of sources) {
      if (!s.guid) continue;
      const records = await fetchStream(s.guid, s.key);
      console.log(`[STREAM-COUNT] ${s.key}: ${records.length} raw records`);
      records.forEach((rec, i) => {
        const m = mapRecord(rec, s.key, i);
        if (!m) return;
        const key = m.phone_number || m.email || m.external_id;
        if (key && seen.has(key)) return;
        if (key) seen.add(key);
        collected.push(m);
      });
    }

    console.log(`[STREAM-MAPPED] total=${collected.length}`);

    if (dryRun) return json({ source: "homely", connected: true, imported: 0, leads: collected });

    // 3) Upsert into leads (skip phones already in DB)
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    for (const p of collected) {
      const phone = p.phone_number;
      if (!phone) { skipped++; continue; }

      const { data: existing } = await admin
        .from("leads").select("id").eq("phone_number", phone).maybeSingle();
      if (existing) { skipped++; continue; }

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
      else {
        failed += 1;
        console.error("[STREAM-UPSERT-ERROR]", phone, insErr.message);
      }
    }

    console.log(`[STREAM-DONE] imported=${imported} skipped=${skipped} failed=${failed}`);
    return json({ source: "homely", connected: true, imported, skipped, failed, total: collected.length });
  } catch (e) {
    console.error("[homely-leads] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});

// Homely daily sync — pulls properties + leads for every broker with stored
// credentials. Intended to be invoked by pg_cron once per day, but also
// callable manually with a Bearer JWT to sync the current user only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const WEBTIV_BASE = "https://webtivapi.webtiv.co.il";
const LOGIN_URL = `${WEBTIV_BASE}/api/login/LoginNewByAgent`;
const OPENCARD_URL = `${WEBTIV_BASE}/api/WebtivLid/WebtivLidPost`;
const PROPERTY_ENDPOINTS = [
  "/api/Nechasim/GetNechasim",
  "/api/Property/GetProperties",
  "/api/Properties/GetAll",
  "/api/Nechasim/Search",
];
const LEAD_ENDPOINTS = [
  "/api/WebtivLid/GetLidim",
  "/api/Lid/GetLidim",
  "/api/Leads/GetAll",
  "/api/WebtivLid/Search",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("972")) return d;
  if (d.startsWith("0")) return "972" + d.slice(1);
  return d;
}

function slugPart(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "property";
}

async function webtivLogin(agency: string, username: string, password: string) {
  try {
    const res = await fetch(LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client: agency, username, password,
        theme: "", version: "realtyz-daily-1.0",
        deviceInfo: { DeviceType: "server", UserAgent: "Realtyz/1.0", Os: "deno", Platform: "edge-function" },
      }),
    });
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* */ }
    if (!res.ok || !data || data.db === 0 || data.db === "0") {
      return { ok: false as const, status: res.status, note: text.slice(0, 240) || `http_${res.status}` };
    }
    return { ok: true as const, session: data };
  } catch (e) {
    return { ok: false as const, status: 0, note: `network:${(e as Error).message}` };
  }
}

async function verifyOpenCard(agency: string): Promise<{ ok: boolean; note: string }> {
  try {
    const res = await fetch(OPENCARD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client: agency, provider: "RealtyZ", category: "מוכר",
        remark: "RealtyZ daily-sync heartbeat",
      }),
    });
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* */ }
    if (data && typeof data === "object") {
      const success = data.success === true || data.success === "true";
      const serial = Number(data.serial);
      if (!success || !Number.isFinite(serial) || serial <= 0) {
        return { ok: false, note: String(data.errorMessage || data.message || "rejected") };
      }
      return { ok: true, note: `serial:${serial}` };
    }
    return { ok: res.ok, note: text.slice(0, 200) || (res.ok ? "ok" : `http_${res.status}`) };
  } catch (e) {
    return { ok: false, note: `network:${(e as Error).message}` };
  }
}

async function fetchSessionResource(session: any, endpoints: string[], extraFilters: Record<string, unknown> = {}) {
  const token = session?.token || session?.Token || session?.accessToken;
  const db = session?.db ?? session?.Db;
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const body = { db, token, page: 1, pageSize: 200, ...extraFilters };

  for (const path of endpoints) {
    try {
      const r = await fetch(`${WEBTIV_BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
      if (!r.ok) continue;
      const payload = await r.json().catch(() => null);
      const items: any[] = Array.isArray(payload)
        ? payload
        : payload?.results || payload?.data || payload?.properties || payload?.leads
          || payload?.Items || payload?.nechasim || payload?.lidim || [];
      if (items.length > 0) return { path, items };
    } catch (e) {
      console.warn(`[homely-daily-sync] ${path} failed:`, (e as Error).message);
    }
  }
  return { path: null as string | null, items: [] as any[] };
}

function normalizeProperty(item: any, idx: number) {
  const photos: string[] = [];
  for (const k of ["photos", "images", "Photos", "Images", "tmunot"]) {
    const v = item?.[k];
    if (Array.isArray(v)) {
      for (const p of v) {
        const u = typeof p === "string" ? p : p?.url || p?.Url || p?.src;
        if (u) photos.push(u);
      }
    }
  }
  return {
    external_id: String(item?.id ?? item?.Id ?? item?.nechesId ?? `homely-${idx}`),
    title: item?.title || item?.Title || item?.kotert || item?.address || "נכס Homely",
    description: item?.description || item?.Description || item?.tiur || "",
    price: Number(item?.price ?? item?.Price ?? item?.mehir ?? 0) || 0,
    city: item?.city || item?.City || item?.ir || null,
    address: item?.address || item?.ktovet || null,
    rooms: Number(item?.rooms ?? item?.Rooms ?? item?.hadarim ?? 0) || null,
    sqm: Number(item?.size_sqm ?? item?.area ?? item?.shetach ?? 0) || null,
    photos,
    url: item?.url || item?.Url || null,
  };
}

function normalizeLead(item: any, idx: number) {
  return {
    external_id: String(item?.id ?? item?.Id ?? item?.lidId ?? `homely-${idx}`),
    full_name: item?.full_name ?? item?.fullName ?? item?.name ?? item?.shemMale ?? "—",
    phone_number: normalizePhone(item?.phone ?? item?.phoneNumber ?? item?.telephone ?? ""),
    email: item?.email ?? null,
    city: item?.city ?? item?.ir ?? null,
    interest_tag: item?.interest ?? item?.tag ?? item?.interestTag ?? "homely_import",
  };
}

async function upsertProperties(admin: any, userId: string, properties: ReturnType<typeof normalizeProperty>[]) {
  let imported = 0, updated = 0;
  for (const p of properties) {
    const payload = {
      user_id: userId,
      property_title: p.title || "נכס Homely",
      description: p.description || "",
      asking_price: p.price,
      city: p.city,
      address: p.address,
      rooms: p.rooms,
      sqm: p.sqm ? Math.round(p.sqm) : null,
      features: [{ photos: p.photos, source_url: p.url, listing_type: "sale" }],
      status: "live",
      is_published: true,
      source: "homely",
      external_id: p.external_id,
      source_url: p.url,
      source_metadata: { provider: "homely", photos: p.photos, raw_imported_at: new Date().toISOString() },
    };
    const { data: existing } = await admin
      .from("listings").select("id")
      .eq("user_id", userId).eq("source", "homely").eq("external_id", p.external_id)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await admin.from("listings").update(payload).eq("id", existing.id);
      if (!error) updated += 1;
    } else {
      const slug = `homely-${userId.slice(0, 8)}-${slugPart(p.external_id)}`;
      const { error } = await admin.from("listings").insert({ ...payload, slug });
      if (!error) imported += 1;
    }
  }
  return { imported, updated };
}

async function upsertLeads(admin: any, userId: string, leads: ReturnType<typeof normalizeLead>[]) {
  let imported = 0;
  for (const lead of leads) {
    const phone = lead.phone_number;
    if (!phone) continue;
    const { data: existing } = await admin
      .from("leads").select("id").eq("phone_number", phone).maybeSingle();
    if (existing) continue;
    const { error } = await admin.from("leads").insert({
      phone_number: phone,
      full_name: lead.full_name,
      email: lead.email,
      city: lead.city,
      interest_tag: lead.interest_tag,
      lead_stage: "new_lead",
      assigned_to: userId,
      is_demo: false,
    });
    if (!error) imported += 1;
  }
  return imported;
}

async function syncBroker(admin: any, cred: any) {
  const userId = cred.user_id as string;
  const agency = String(cred.homely_agency || "");
  const username = String(cred.homely_username || "");
  const result: any = {
    user_id: userId,
    agency,
    opencard_ok: false,
    login_ok: false,
    properties: { imported: 0, updated: 0, found: 0, endpoint: null },
    leads: { imported: 0, found: 0, endpoint: null },
    errors: [] as string[],
  };

  if (!agency) { result.errors.push("missing_agency_code"); return result; }

  const opencard = await verifyOpenCard(agency);
  result.opencard_ok = opencard.ok;
  result.opencard_note = opencard.note;
  if (!opencard.ok) result.errors.push(`opencard:${opencard.note}`);

  if (!username) { result.errors.push("missing_username"); }
  else {
    const { data: pw } = await admin.rpc("get_homely_password", { _user_id: userId });
    if (!pw) result.errors.push("missing_password");
    else {
      const login = await webtivLogin(agency, username, String(pw));
      result.login_ok = login.ok;
      if (!login.ok) result.errors.push(`login:${login.status}:${login.note}`);
      else {
        // Properties
        const propRes = await fetchSessionResource(login.session, PROPERTY_ENDPOINTS);
        result.properties.found = propRes.items.length;
        result.properties.endpoint = propRes.path;
        if (propRes.items.length > 0) {
          const normalized = propRes.items.map((it, i) => normalizeProperty(it, i));
          const stats = await upsertProperties(admin, userId, normalized);
          result.properties.imported = stats.imported;
          result.properties.updated = stats.updated;
        }
        // Leads
        const leadRes = await fetchSessionResource(login.session, LEAD_ENDPOINTS);
        result.leads.found = leadRes.items.length;
        result.leads.endpoint = leadRes.path;
        if (leadRes.items.length > 0) {
          const normalized = leadRes.items.map((it, i) => normalizeLead(it, i));
          result.leads.imported = await upsertLeads(admin, userId, normalized);
        }
      }
    }
  }

  await admin.from("homely_broker_credentials").update({
    connection_status: opencard.ok && result.login_ok ? "ok" : "failed",
    last_verified_at: new Date().toISOString(),
    last_error: result.errors.length ? result.errors.join(" | ").slice(0, 500) : null,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedCron = Deno.env.get("CRON_SECRET");

    // Determine target user(s)
    let targetUserId: string | null = null;
    let isCron = false;
    if (cronSecret && expectedCron && cronSecret === expectedCron) {
      isCron = true;
    } else {
      const auth = req.headers.get("Authorization") || "";
      if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "Unauthorized" }, 401);
      targetUserId = (body as any)?.user_id || user.id;
    }

    let query = admin.from("homely_broker_credentials").select("user_id, homely_agency, homely_username");
    if (!isCron && targetUserId) query = query.eq("user_id", targetUserId);
    const { data: creds, error } = await query;
    if (error) return json({ error: error.message }, 500);

    const results = [];
    for (const cred of (creds || [])) {
      results.push(await syncBroker(admin, cred));
    }

    return json({
      ok: true,
      mode: isCron ? "cron" : "manual",
      brokers_processed: results.length,
      results,
    });
  } catch (e) {
    console.error("[homely-daily-sync] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});

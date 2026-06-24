// Homely (Webtiv) Leads Importer — real data only.
//
// Logs into webtivapi.webtiv.co.il with the broker's stored credentials, then
// posts to candidate Webtiv lead endpoints. Imports unique leads (phone as
// natural key) into the `leads` table assigned to the calling user. No mock
// fallback — when there is no connection or zero leads we return an empty
// result so the UI does not show fake data.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const WEBTIV_BASE = "https://webtivapi.webtiv.co.il";
const LOGIN_URL = `${WEBTIV_BASE}/api/login/LoginNewByAgent`;
const LEAD_ENDPOINTS = [
  "/api/WebtivLid/GetLidim",
  "/api/WebtivLid/GetAll",
  "/api/WebtivLid/Search",
  "/api/WebtivLid/List",
  "/api/Lid/GetLidim",
  "/api/Lid/GetAll",
  "/api/Lid/Search",
  "/api/Leads/GetAll",
  "/api/Leads/Search",
  "/api/Leads/List",
  "/api/Contacts/GetAll",
  "/api/Contacts/Search",
];

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

function normalizePhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return digits;
}

async function webtivLogin(agency: string, username: string, password: string) {
  const res = await fetch(LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client: agency, username, password,
      theme: "", version: "realtyz-1.0",
      deviceInfo: { DeviceType: "server", UserAgent: "Realtyz/1.0", Os: "deno", Platform: "edge-function" },
    }),
  });
  const text = await res.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* */ }
  if (!res.ok || !data || data.db === 0 || data.db === "0") {
    return { ok: false as const, status: res.status, note: text.slice(0, 200) };
  }
  return { ok: true as const, session: data };
}

async function fetchWebtivLeads(session: any): Promise<HomelyLead[]> {
  const token = session?.token || session?.Token || session?.accessToken;
  const db = session?.db ?? session?.Db;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const PAGE_SIZE = 500;
  const MAX_PAGES = 100; // hard ceiling -> 50k leads
  const seen = new Set<string>();
  const mapItem = (it: any, i: number): HomelyLead => ({
    external_id: String(it?.id ?? it?.Id ?? it?.lidId ?? it?.LidId ?? `homely-${i}`),
    full_name: it?.full_name ?? it?.fullName ?? it?.name ?? it?.shemMale ?? it?.ShemMale ?? "—",
    phone_number: normalizePhone(it?.phone ?? it?.phoneNumber ?? it?.telephone ?? it?.Telephone ?? it?.Pelephone ?? ""),
    email: it?.email ?? it?.Email ?? null,
    city: it?.city ?? it?.ir ?? it?.Ir ?? null,
    interest_tag: it?.interest ?? it?.tag ?? it?.interestTag ?? null,
    preferences: (it?.preferences as Record<string, unknown>) ?? { homely_raw: it, source: "homely" },
  });

  for (const path of LEAD_ENDPOINTS) {
    const collected: HomelyLead[] = [];
    let page = 1;
    let endpointWorks = false;
    while (page <= MAX_PAGES) {
      try {
        const r = await fetch(`${WEBTIV_BASE}${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ db, token, page, pageSize: PAGE_SIZE, PageSize: PAGE_SIZE, Page: page }),
        });
        if (!r.ok) {
          if (!endpointWorks) break; // try next endpoint
          break;
        }
        const payload = await r.json().catch(() => null);
        const items: any[] = Array.isArray(payload)
          ? payload
          : payload?.results || payload?.data || payload?.leads || payload?.Items || payload?.lidim || payload?.Lidim || [];
        console.log(`[homely-leads] ${path} page=${page} -> ${items.length} items`);
        if (items.length === 0) break;
        endpointWorks = true;
        for (const it of items) {
          const m = mapItem(it, collected.length);
          const key = m.external_id || m.phone_number;
          if (key && seen.has(key)) continue;
          if (key) seen.add(key);
          collected.push(m);
        }
        if (items.length < PAGE_SIZE) break; // last page
        page += 1;
      } catch (e) {
        console.warn(`[homely-leads] ${path} page=${page} failed:`, (e as Error).message);
        break;
      }
    }
    if (collected.length > 0) return collected;
  }
  return [];
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

    // Load broker credentials
    const { data: cred } = await admin
      .from("homely_broker_credentials")
      .select("homely_agency, homely_username")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!cred?.homely_agency || !cred?.homely_username) {
      return json({ source: "homely", connected: false, imported: 0, leads: [], note: "no_credentials" });
    }
    const { data: pw } = await admin.rpc("get_homely_password", { _user_id: user.id });
    if (!pw) {
      return json({ source: "homely", connected: false, imported: 0, leads: [], note: "no_password" });
    }

    const login = await webtivLogin(String(cred.homely_agency), String(cred.homely_username), pw as unknown as string);
    if (!login.ok) {
      return json({ source: "homely", connected: false, imported: 0, leads: [], error: `login_failed:${login.status}:${login.note}` });
    }

    const leads = await fetchWebtivLeads(login.session);
    if (dryRun) return json({ source: "homely", connected: true, imported: 0, leads });

    let imported = 0;
    for (const p of leads) {
      const phone = normalizePhone(p.phone_number);
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

    return json({ source: "homely", connected: true, imported, leads });
  } catch (e) {
    console.error("[homely-leads] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});

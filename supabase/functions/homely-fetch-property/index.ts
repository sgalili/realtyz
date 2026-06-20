// Pull live data from Homely / Webtiv using the verified production routes
// reverse-engineered from the Homely web app's own network traffic.
//
// Verified routes (all GET unless noted):
//   /api/login/LoginNewByAgent                                   (POST handshake)
//   /api/login/getWorkerList/{hash}/{officeId}
//   /api/wtable/getTblZonesNames
//   /api/report/getInterestingAdminByAgent/{hash}/{officeId}/null/null
//   /api/report/getAgenda/{hash}/null/null
//   /api/report/getSearchSummaries/{hash}
//   /api/report/getRounds/{hash}
//   /api/hashData/getAllKeys/{hash}                              (POST)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const WEBTIV_BASE = "https://webtivapi.webtiv.co.il";
const LOGIN_URL = `${WEBTIV_BASE}/api/login/LoginNewByAgent`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

// Walk the login payload and pull the long hex/base64 session hash that the
// Homely web app sends in URL paths (e.g. 5DE65360853C884259501FBFF967FF0B or
// I4ZtypkjAjdz17NVTEGC7A==).
function extractHash(session: any): string | null {
  const direct = session?.hash || session?.Hash || session?.agentHash || session?.AgentHash
    || session?.sessionHash || session?.SessionHash || session?.userHash || session?.UserHash
    || session?.token || session?.Token || session?.accessToken;
  if (direct && typeof direct === "string") return direct;
  // Walk one level deep for nested user/agent objects.
  const nested = [session?.user, session?.User, session?.agent, session?.Agent, session?.data, session?.result];
  for (const n of nested) {
    if (!n || typeof n !== "object") continue;
    const v = n?.hash || n?.Hash || n?.token || n?.Token || n?.agentHash || n?.AgentHash;
    if (v && typeof v === "string") return v;
  }
  // Scan all string values for hex(>=24) or base64-ish ending in ==
  const stack: any[] = [session];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    for (const v of Object.values(cur)) {
      if (typeof v === "string") {
        if (/^[A-F0-9]{24,}$/i.test(v)) return v;
        if (/^[A-Za-z0-9+/]{16,}={0,2}$/.test(v) && v.length >= 20 && v.length <= 64) return v;
      } else if (v && typeof v === "object") {
        stack.push(v);
      }
    }
  }
  return null;
}

// The second path slot in getInterestingAdminByAgent is the Worker/Agent ID
// (e.g. 6617303), NOT the office id. Walk the login payload for it; fall back
// to the known-good agent id so the grid still populates while we audit.
function extractAgentId(session: any, fallback = "6617303"): string {
  const KEYS = [
    "agentId", "AgentId", "AgentID", "agent_id",
    "workerId", "WorkerId", "WorkerID", "worker_id",
    "userId", "UserId", "UserID", "user_id",
    "userCode", "UserCode", "id", "Id",
  ];
  const pick = (o: any) => {
    if (!o || typeof o !== "object") return null;
    for (const k of KEYS) {
      const v = o[k];
      if (typeof v === "number" && v > 0) return String(v);
      if (typeof v === "string" && /^\d{4,}$/.test(v)) return v;
    }
    return null;
  };
  const direct = pick(session)
    ?? pick(session?.user) ?? pick(session?.User)
    ?? pick(session?.agent) ?? pick(session?.Agent)
    ?? pick(session?.worker) ?? pick(session?.Worker)
    ?? pick(session?.data) ?? pick(session?.result);
  if (direct) return direct;
  // Deep scan for any numeric id that looks like a worker id (7+ digits).
  const stack: any[] = [session];
  const seen = new Set<any>();
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    for (const [k, v] of Object.entries(cur)) {
      if ((typeof v === "number" || typeof v === "string") && /id$/i.test(k)) {
        const s = String(v);
        if (/^\d{6,}$/.test(s)) return s;
      } else if (v && typeof v === "object") stack.push(v);
    }
  }
  return fallback;
}

async function getJson(url: string) {
  const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Realtyz/1.0" } });
  const text = await r.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* HTML/IIS error */ }
  return { status: r.status, data, sample: text.slice(0, 200) };
}

function asArray(x: any): any[] {
  if (Array.isArray(x)) return x;
  if (!x || typeof x !== "object") return [];
  for (const k of ["result", "data", "items", "list", "rows", "Result", "Data", "Items", "List", "Rows"]) {
    if (Array.isArray(x[k])) return x[k];
  }
  // First array-valued property
  for (const v of Object.values(x)) if (Array.isArray(v)) return v as any[];
  return [];
}

function mapProperty(it: any, idx: number) {
  const id = String(it?.id ?? it?.Id ?? it?.nechesId ?? it?.NechesId ?? it?.propertyId ?? it?.PropertyId
    ?? it?.sidur ?? it?.Sidur ?? it?.serial ?? it?.Serial ?? `row-${idx + 1}`);
  const photo = it?.photo ?? it?.Photo ?? it?.image ?? it?.Image ?? it?.mainImage ?? it?.MainImage
    ?? (Array.isArray(it?.photos) ? it.photos[0] : null)
    ?? (Array.isArray(it?.Photos) ? it.Photos[0] : null);
  return {
    homely_id: id,
    title: String(it?.title ?? it?.Title ?? it?.kotert ?? it?.Kotert ?? it?.name ?? it?.Name ?? ""),
    description: String(it?.description ?? it?.Description ?? it?.tiur ?? it?.Tiur ?? it?.remarks ?? it?.Remarks ?? ""),
    price: Number(it?.price ?? it?.Price ?? it?.mehir ?? it?.Mehir ?? it?.askingPrice ?? it?.AskingPrice ?? 0) || 0,
    city: String(it?.city ?? it?.City ?? it?.ir ?? it?.Ir ?? it?.town ?? ""),
    address: String(it?.address ?? it?.Address ?? it?.ktovet ?? it?.Ktovet ?? it?.street ?? ""),
    rooms: Number(it?.rooms ?? it?.Rooms ?? it?.hadarim ?? it?.Hadarim ?? 0) || 0,
    sqm: Number(it?.sqm ?? it?.Sqm ?? it?.size ?? it?.Size ?? it?.shetach ?? it?.Shetach ?? it?.area ?? 0) || 0,
    floor: Number(it?.floor ?? it?.Floor ?? it?.koma ?? it?.Koma ?? 0) || 0,
    photo: typeof photo === "string" ? photo : null,
    raw: it,
  };
}

function mapContact(it: any, idx: number) {
  const id = String(it?.id ?? it?.Id ?? it?.adamId ?? it?.AdamId ?? it?.contactId ?? it?.ContactId
    ?? it?.leadId ?? it?.LeadId ?? `row-${idx + 1}`);
  const first = it?.firstName ?? it?.FirstName ?? it?.shemPrati ?? "";
  const last = it?.lastName ?? it?.LastName ?? it?.shemMishpacha ?? "";
  const full = (it?.fullName ?? it?.FullName ?? it?.name ?? it?.Name ?? `${first} ${last}`).toString().trim();
  return {
    homely_id: id,
    full_name: full,
    phone: String(it?.phone ?? it?.Phone ?? it?.mobile ?? it?.Mobile ?? it?.cellular ?? it?.Cellular ?? it?.tel ?? ""),
    email: String(it?.email ?? it?.Email ?? it?.mail ?? ""),
    city: String(it?.city ?? it?.City ?? it?.ir ?? ""),
    notes: String(it?.notes ?? it?.Notes ?? it?.remarks ?? it?.Remarks ?? it?.summary ?? ""),
    raw: it,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const action = (body as any)?.action as string | undefined;
    const listing_id = (body as any)?.listing_id;

    // ---------- Bulk pull (verified Webtiv report routes) ----------
    if (action === "fetchAllProperties" || action === "fetchAllContacts") {
      const { data: cred } = await admin
        .from("homely_broker_credentials")
        .select("homely_agency, homely_username")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cred?.homely_agency || !cred?.homely_username) {
        return json({ ok: false, needs_setup: true, error: "no_homely_credentials", action }, 200);
      }
      const { data: pw } = await admin.rpc("get_homely_password", { _user_id: user.id });
      if (!pw) return json({ ok: false, needs_setup: true, error: "no_homely_password" }, 200);

      const login = await webtivLogin(String(cred.homely_agency), String(cred.homely_username), pw as unknown as string);
      if (!login.ok) return json({ error: `login_failed:${login.status}`, note: login.note }, 502);

      const hash = extractHash(login.session);
      if (!hash) {
        return json({
          ok: false,
          error: "no_hash_in_login",
          note: "Login succeeded but no agent hash token was returned.",
          session_keys: Object.keys(login.session || {}),
        }, 200);
      }
      const agentId = extractAgentId(login.session);
      console.log(`[homely-fetch-property] login OK, hash len=${hash.length}, agentId=${agentId}`);

      const debug: any[] = [];

      if (action === "fetchAllProperties") {
        // Primary: getInterestingAdminByAgent → broker's live listings feed.
        const candidates = [
          `${WEBTIV_BASE}/api/report/getInterestingAdminByAgent/${encodeURIComponent(hash)}/${encodeURIComponent(agentId)}/null/null`,
          `${WEBTIV_BASE}/api/report/getInterestingAdminByAgent/${encodeURIComponent(hash)}/${encodeURIComponent(agentId)}/null/null/null`,
        ];
        let items: any[] = [];
        let usedUrl: string | null = null;
        for (const url of candidates) {
          const r = await getJson(url);
          debug.push({ url, status: r.status, sample: r.sample, topKeys: r.data && typeof r.data === "object" ? Object.keys(r.data).slice(0, 10) : null });
          console.log(`[homely-fetch-property] GET ${url} → ${r.status}`);
          if (r.status >= 200 && r.status < 300) {
            const arr = asArray(r.data);
            if (arr.length) { items = arr; usedUrl = url; break; }
            if (!items.length) usedUrl = url; // remember last 200 even if empty
          }
        }
        const properties = items.map(mapProperty);
        return json({
          ok: true,
          source: "report.getInterestingAdminByAgent",
          endpoint: usedUrl,
          count: properties.length,
          properties,
          empty: properties.length === 0,
          message: properties.length === 0
            ? "התחברות הצליחה, לא נמצאו נכסים פעילים בחשבון הומלי המחובר."
            : undefined,
          debug,
        });
      }

      // ---- contacts ---- (search summaries = leads/buyers actively searching)
      const candidates = [
        `${WEBTIV_BASE}/api/report/getSearchSummaries/${encodeURIComponent(hash)}`,
        `${WEBTIV_BASE}/api/report/getRounds/${encodeURIComponent(hash)}`,
        `${WEBTIV_BASE}/api/report/getAgenda/${encodeURIComponent(hash)}/null/null`,
      ];
      let items: any[] = [];
      let usedUrl: string | null = null;
      for (const url of candidates) {
        const r = await getJson(url);
        debug.push({ url, status: r.status, sample: r.sample, topKeys: r.data && typeof r.data === "object" ? Object.keys(r.data).slice(0, 10) : null });
        console.log(`[homely-fetch-property] GET ${url} → ${r.status}`);
        if (r.status >= 200 && r.status < 300) {
          const arr = asArray(r.data);
          if (arr.length) { items = arr; usedUrl = url; break; }
          if (!usedUrl) usedUrl = url;
        }
      }
      const contacts = items.map(mapContact);
      return json({
        ok: true,
        source: "report.getSearchSummaries",
        endpoint: usedUrl,
        count: contacts.length,
        contacts,
        empty: contacts.length === 0,
        message: contacts.length === 0
          ? "התחברות הצליחה, לא נמצאו אנשי קשר פעילים בחשבון הומלי המחובר."
          : undefined,
        debug,
      });
    }

    // ---------- Single listing refresh (used by Edit dialog) ----------
    if (!listing_id) return json({ error: "listing_id required" }, 400);

    const { data: listing } = await admin
      .from("listings")
      .select("id, user_id, property_title, description, asking_price, city, address, rooms, sqm, floor, features, source_metadata, external_id")
      .eq("id", listing_id)
      .maybeSingle();
    if (!listing) return json({ error: "listing_not_found" }, 404);

    const meta = (listing.source_metadata as any) ?? {};
    const serial = listing.external_id || meta.serial || meta.sidur || meta.extras?.["סדורי"];
    if (!serial) return json({ error: "no_serial_on_listing", hint: "source_metadata.serial missing" }, 400);

    const { data: cred } = await admin
      .from("homely_broker_credentials")
      .select("homely_agency, homely_username")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!cred?.homely_agency || !cred?.homely_username) {
      return json({ ok: false, needs_setup: true, error: "no_homely_credentials" }, 200);
    }
    const { data: pw } = await admin.rpc("get_homely_password", { _user_id: user.id });
    if (!pw) return json({ ok: false, needs_setup: true, error: "no_homely_password" }, 200);

    const login = await webtivLogin(String(cred.homely_agency), String(cred.homely_username), pw as unknown as string);
    if (!login.ok) return json({ error: `login_failed:${login.status}`, note: login.note }, 502);

    const hash = extractHash(login.session);
    if (!hash) return json({ error: "no_hash_in_login" }, 502);
    const agentId = extractAgentId(login.session);

    // Pull the broker's active list and find the matching serial in it.
    const url = `${WEBTIV_BASE}/api/report/getInterestingAdminByAgent/${encodeURIComponent(hash)}/${encodeURIComponent(agentId)}/null/null`;
    const r = await getJson(url);
    const list = asArray(r.data);
    const serialStr = String(serial);
    const detail = list.find((it: any) => {
      const ids = [it?.id, it?.Id, it?.nechesId, it?.NechesId, it?.sidur, it?.Sidur, it?.serial, it?.Serial, it?.propertyId, it?.PropertyId]
        .filter((v) => v !== undefined && v !== null)
        .map(String);
      return ids.includes(serialStr);
    });
    if (!detail) {
      return json({
        ok: false,
        error: "property_not_found_in_broker_list",
        endpoint: url,
        broker_active_count: list.length,
        serial,
      }, 200);
    }

    const mapped = mapProperty(detail, 0);
    const updated = {
      property_title: mapped.title || listing.property_title,
      description: mapped.description || listing.description,
      asking_price: mapped.price || listing.asking_price,
      city: mapped.city || listing.city,
      address: mapped.address || listing.address,
      rooms: mapped.rooms || listing.rooms,
      sqm: mapped.sqm || listing.sqm,
      floor: mapped.floor || listing.floor,
      external_id: String(serial),
      source_metadata: {
        ...meta,
        photos: mapped.photo ? [mapped.photo] : (meta.photos ?? []),
        homely_raw: detail,
        synced_at: new Date().toISOString(),
        endpoint: url,
      },
    };

    const { error: upErr } = await admin.from("listings").update(updated).eq("id", listing_id);
    if (upErr) return json({ error: `db_update_failed:${upErr.message}` }, 500);

    return json({ ok: true, listing_id, serial, endpoint: url, photo_count: mapped.photo ? 1 : 0, updated });
  } catch (e) {
    console.error("[homely-fetch-property] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});

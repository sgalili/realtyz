// Fetch full property data (incl. photos) from Homely/Webtiv by serial number
// and update the local listings row in place.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const WEBTIV_BASE = "https://webtivapi.webtiv.co.il";
const LOGIN_URL = `${WEBTIV_BASE}/api/login/LoginNewByAgent`;

// Candidate detail endpoints — different Webtiv installs use different paths.
const DETAIL_ENDPOINTS = [
  "/api/Nechasim/GetNeches",
  "/api/Nechasim/GetById",
  "/api/Nechasim/Get",
  "/api/Property/GetProperty",
  "/api/Properties/Get",
];

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

function extractPhotos(item: any): string[] {
  const out: string[] = [];
  for (const k of ["photos", "images", "Photos", "Images", "tmunot", "Tmunot", "pics"]) {
    const v = item?.[k];
    if (Array.isArray(v)) {
      for (const p of v) {
        const u = typeof p === "string" ? p : p?.url || p?.Url || p?.src || p?.image || p?.path;
        if (u && typeof u === "string") out.push(u);
      }
    }
  }
  return Array.from(new Set(out));
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

    // ------------- Bulk actions (manual-trigger only — gated by the
    // dialog's "סנכרון מלא מהומלי" button on the Properties page) -------------
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
      if (!pw) return json({ ok: false, needs_setup: true, error: "no_homely_password", action }, 200);
      const login = await webtivLogin(String(cred.homely_agency), String(cred.homely_username), pw as unknown as string);
      if (!login.ok) return json({ error: `login_failed:${login.status}`, note: login.note }, 502);
      const session = login.session as any;
      const token = session?.token || session?.Token || session?.accessToken;
      const db = session?.db ?? session?.Db;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // ✅ Verified Homely/Webtiv paths (mirror homely-daily-sync + homely-leads,
      // which return live data today). The previous `/GetActiveByBroker`,
      // `/GetAll`, `/GetActive` paths all returned 404 HTML.
      const PATHS = action === "fetchAllProperties"
        ? ["/api/Nechasim/GetNechasim", "/api/Property/GetProperties", "/api/Properties/GetAll", "/api/Nechasim/Search"]
        : ["/api/WebtivLid/GetLidim", "/api/Lid/GetLidim", "/api/Leads/GetAll", "/api/WebtivLid/Search"];

      // Walk any object/array tree and return the first array that "looks like"
      // a list of records (objects with id-ish or name-ish fields). This lets
      // us survive Homely returning {Data: {Items: [...]}} or {result: {list: [...]}}
      // or {properties: [...]} without hard-coding each shape.
      function findRecordArray(root: any): { arr: any[]; path: string } | null {
        const seen = new Set<any>();
        const queue: Array<{ v: any; p: string }> = [{ v: root, p: "$" }];
        while (queue.length) {
          const { v, p } = queue.shift()!;
          if (!v || typeof v !== "object" || seen.has(v)) continue;
          seen.add(v);
          if (Array.isArray(v)) {
            if (v.length && typeof v[0] === "object" && v[0] !== null) {
              const keys = Object.keys(v[0]);
              if (keys.length >= 2) return { arr: v, path: p };
            }
            continue;
          }
          for (const k of Object.keys(v)) queue.push({ v: v[k], p: `${p}.${k}` });
        }
        return null;
      }

      let items: any[] = [];
      let usedEndpoint: string | null = null;
      let arrPath = "";
      let lastError = "";
      const debug: Array<{ path: string; status?: number; topKeys?: string[]; sample?: string }> = [];
      for (const path of PATHS) {
        try {
          const r = await fetch(`${WEBTIV_BASE}${path}`, {
            method: "POST",
            headers,
            body: JSON.stringify({ db, token, agency: cred.homely_agency }),
          });
          const text = await r.text();
          let data: any = null;
          try { data = JSON.parse(text); } catch { /* not json */ }
          const topKeys = data && typeof data === "object" && !Array.isArray(data) ? Object.keys(data) : [];
          debug.push({ path, status: r.status, topKeys, sample: text.slice(0, 240) });
          console.log(`[homely-fetch-property] ${action} ${path} -> HTTP ${r.status}, topKeys=${JSON.stringify(topKeys)}, sample=${text.slice(0, 400)}`);
          if (!r.ok) { lastError = `${path}:HTTP ${r.status}`; continue; }
          if (!data) { lastError = `${path}:not_json`; continue; }
          const found = Array.isArray(data) ? { arr: data, path: "$" } : findRecordArray(data);
          if (found && found.arr.length) {
            items = found.arr;
            usedEndpoint = path;
            arrPath = found.path;
            console.log(`[homely-fetch-property] ${action} matched ${items.length} items at ${path}${found.path}`);
            break;
          }
          // Empty payload from a valid endpoint — accept and stop probing.
          if (found && Array.isArray(found.arr)) {
            usedEndpoint = path;
            arrPath = found.path;
            break;
          }
        } catch (e) {
          lastError = `${path}:${(e as Error).message}`;
        }
      }

      if (action === "fetchAllProperties") {
        const properties = items.map((it: any) => ({
          homely_id: String(it?.id ?? it?.Id ?? it?.nechesId ?? it?.NechesId ?? it?.sidur ?? it?.Sidur ?? it?.serial ?? it?.PropertyId ?? it?.propertyId ?? ""),
          title: it?.title || it?.Title || it?.kotert || it?.Kotert || it?.Name || it?.name || "",
          description: it?.description || it?.Description || it?.tiur || it?.Tiur || "",
          price: Number(it?.price ?? it?.Price ?? it?.mehir ?? it?.Mehir ?? 0) || 0,
          city: it?.city || it?.City || it?.ir || it?.Ir || "",
          address: it?.address || it?.Address || it?.ktovet || it?.Ktovet || "",
          rooms: Number(it?.rooms ?? it?.Rooms ?? it?.hadarim ?? it?.Hadarim ?? 0) || 0,
          sqm: Number(it?.size_sqm ?? it?.area ?? it?.shetach ?? it?.Shetach ?? 0) || 0,
          floor: Number(it?.floor ?? it?.Floor ?? it?.koma ?? it?.Koma ?? 0) || 0,
          photo: extractPhotos(it)[0] ?? null,
          raw: it,
        })).filter((p) => p.homely_id);
        return json({ ok: true, endpoint: usedEndpoint, array_path: arrPath, count: properties.length, properties, empty: properties.length === 0, last_error: lastError, debug });
      } else {
        const contacts = items.map((it: any) => ({
          homely_id: String(it?.id ?? it?.Id ?? it?.contactId ?? it?.ContactId ?? it?.adamId ?? it?.AdamId ?? ""),
          full_name: it?.full_name || it?.FullName || it?.name || it?.Name || it?.shem || it?.Shem || "",
          phone: it?.phone || it?.Phone || it?.mobile || it?.Mobile || it?.telefon || it?.Telefon || it?.Cell || it?.cell || "",
          email: it?.email || it?.Email || "",
          city: it?.city || it?.City || it?.ir || "",
          notes: it?.notes || it?.Notes || it?.heara || it?.Heara || "",
          raw: it,
        })).filter((c) => c.phone || c.email);
        return json({ ok: true, endpoint: usedEndpoint, array_path: arrPath, count: contacts.length, contacts, empty: contacts.length === 0, last_error: lastError, debug });
      }
    }

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

    const session = login.session as any;
    const token = session?.token || session?.Token || session?.accessToken;
    const db = session?.db ?? session?.Db;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    let detail: any = null;
    let usedEndpoint: string | null = null;
    let lastError = "";
    const variants = [
      { id: serial, db, token },
      { nechesId: serial, db, token },
      { sidur: serial, db, token },
      { sidurId: serial, db, token },
      { Id: serial, db, token },
    ];
    for (const path of DETAIL_ENDPOINTS) {
      for (const payload of variants) {
        try {
          const r = await fetch(`${WEBTIV_BASE}${path}`, {
            method: "POST", headers, body: JSON.stringify(payload),
          });
          if (!r.ok) { lastError = `${path}:HTTP ${r.status}`; continue; }
          const data = await r.json().catch(() => null);
          const item = Array.isArray(data) ? data[0] : (data?.result || data?.data || data?.neches || data?.property || data);
          if (item && (item.id || item.Id || item.nechesId || item.sidur || item.address || item.kotert || item.title)) {
            detail = item;
            usedEndpoint = path;
            break;
          }
        } catch (e) {
          lastError = `${path}:${(e as Error).message}`;
        }
      }
      if (detail) break;
    }

    // 404 fallback: Homely's per-id endpoints don't recognize the serial we
    // stored locally. Pivot to the broker-wide active-listings payload and
    // locate the matching record there instead of crashing the dashboard.
    if (!detail) {
      const FALLBACK_PATHS = [
        "/api/Properties/GetActiveByBroker",
        "/api/Nechasim/GetActiveByBroker",
        "/api/Nechasim/GetAll",
      ];
      let broaderList: any[] = [];
      let fallbackEndpoint: string | null = null;
      for (const path of FALLBACK_PATHS) {
        try {
          const r = await fetch(`${WEBTIV_BASE}${path}`, {
            method: "POST",
            headers,
            body: JSON.stringify({ db, token, agency: cred.homely_agency }),
          });
          if (!r.ok) { lastError = `${path}:HTTP ${r.status}`; continue; }
          const data = await r.json().catch(() => null);
          const arr = Array.isArray(data) ? data : (data?.result || data?.data || data?.items || data?.nechasim || []);
          if (Array.isArray(arr) && arr.length) {
            broaderList = arr;
            fallbackEndpoint = path;
            break;
          }
        } catch (e) {
          lastError = `${path}:${(e as Error).message}`;
        }
      }
      const serialStr = String(serial);
      const match = broaderList.find((it: any) => {
        const candidates = [it?.id, it?.Id, it?.nechesId, it?.NechesId, it?.sidur, it?.Sidur, it?.serial, it?.Serial]
          .filter((v) => v !== undefined && v !== null)
          .map(String);
        return candidates.includes(serialStr);
      });
      if (match) {
        detail = match;
        usedEndpoint = `${fallbackEndpoint}#match`;
      } else if (broaderList.length) {
        return json({
          error: "property_not_found_in_broker_list",
          fallback: true,
          fallback_endpoint: fallbackEndpoint,
          broker_active_count: broaderList.length,
          serial,
          last_error: lastError,
        }, 200);
      } else {
        return json({
          error: "property_not_found_on_homely",
          fallback: true,
          last_error: lastError,
          serial,
        }, 200);
      }
    }

    const photos = extractPhotos(detail);
    const price = Number(detail?.price ?? detail?.Price ?? detail?.mehir ?? listing.asking_price) || Number(listing.asking_price);
    const updated = {
      property_title: detail?.title || detail?.Title || detail?.kotert || listing.property_title,
      description: detail?.description || detail?.Description || detail?.tiur || listing.description,
      asking_price: price,
      city: detail?.city || detail?.City || detail?.ir || listing.city,
      address: detail?.address || detail?.Address || detail?.ktovet || listing.address,
      rooms: Number(detail?.rooms ?? detail?.Rooms ?? detail?.hadarim ?? listing.rooms) || listing.rooms,
      sqm: Number(detail?.size_sqm ?? detail?.area ?? detail?.shetach ?? listing.sqm) || listing.sqm,
      floor: Number(detail?.floor ?? detail?.Floor ?? detail?.koma ?? listing.floor) || listing.floor,
      external_id: String(serial),
      source_metadata: {
        ...meta,
        photos,
        homely_raw: detail,
        synced_at: new Date().toISOString(),
        endpoint: usedEndpoint,
      },
    };

    const { error: upErr } = await admin.from("listings").update(updated).eq("id", listing_id);
    if (upErr) return json({ error: `db_update_failed:${upErr.message}` }, 500);

    return json({ ok: true, listing_id, serial, endpoint: usedEndpoint, photo_count: photos.length, updated });
  } catch (e) {
    console.error("[homely-fetch-property] fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});

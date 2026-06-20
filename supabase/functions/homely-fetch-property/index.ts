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
    // "סנכרון מלא מהומלי" dialog on the Properties page). The Webtiv JSON
    // API only exposes login + WebtivLidPost (push) — there are no public GET
    // routes for nechasim/contacts. So we pull the official Homely broker
    // XML/IDX feed (the same one syndicated to Yad2/Madlan). The broker
    // pastes the feed URL in /settings → חיבורים → Homely. -------------
    if (action === "fetchAllProperties" || action === "fetchAllContacts") {
      // Contacts are NOT exposed via the XML feed. Be honest.
      if (action === "fetchAllContacts") {
        return json({
          ok: true,
          empty: true,
          unsupported: true,
          contacts: [],
          message:
            "Homely אינה מספקת פיד אנשי קשר ציבורי. אנשי קשר נכנסים אוטומטית כאשר Homely שולחת ליד לכתובת ה‑Webhook שלך (מוצגת בטופס Homely). אין צורך לסנכרן ידנית.",
        });
      }

      const { data: cred } = await admin
        .from("homely_broker_credentials")
        .select("homely_agency, homely_username, homely_feed_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cred?.homely_agency || !cred?.homely_username) {
        return json({ ok: false, needs_setup: true, error: "no_homely_credentials", action }, 200);
      }
      const feedUrl = (cred as any)?.homely_feed_url as string | null;
      if (!feedUrl || !/^https?:\/\//i.test(feedUrl)) {
        return json({
          ok: false,
          needs_feed_url: true,
          empty: true,
          properties: [],
          message:
            "כדי להציג את הנכסים שלך כאן, יש להזין את כתובת פיד ה‑XML שלכם מהומלי (נמצא בהגדרות הומלי ← הפצה לאתרים / פיד XML).",
        }, 200);
      }

      console.log(`[homely-fetch-property] Targeting Homely XML feed: ${feedUrl}`);
      let xmlText = "";
      let httpStatus = 0;
      try {
        const r = await fetch(feedUrl, {
          headers: { Accept: "application/xml, text/xml, */*", "User-Agent": "Realtyz/1.0" },
        });
        httpStatus = r.status;
        xmlText = await r.text();
        console.log(`[homely-fetch-property] Feed HTTP ${httpStatus}, bytes=${xmlText.length}, sample=${xmlText.slice(0, 240)}`);
      } catch (e) {
        return json({ ok: false, error: `feed_fetch_failed:${(e as Error).message}`, properties: [], empty: true }, 200);
      }
      if (httpStatus < 200 || httpStatus >= 300 || !xmlText) {
        return json({
          ok: false,
          error: `feed_http_${httpStatus}`,
          properties: [],
          empty: true,
          message: "לא הצלחנו להוריד את פיד ה‑XML. ודאו שהקישור פתוח לציבור ושאינו מוגן בסיסמה.",
        }, 200);
      }

      // -------- Minimal XML extractor --------
      // Strip XML/CDATA noise and pull each <property|listing|item|neches>...</...>
      // block, then extract common child tags case-insensitively. Works against
      // Yad2/Madlan-shaped Homely feeds without needing a full DOM parser.
      function decodeEntities(s: string): string {
        return s
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
      }
      function pickTag(block: string, names: string[]): string {
        for (const n of names) {
          const m = block.match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)<\\/${n}>`, "i"));
          if (m && m[1] != null) {
            const v = decodeEntities(m[1]).replace(/<[^>]+>/g, "").trim();
            if (v) return v;
          }
        }
        return "";
      }
      function pickAllUrls(block: string, wrapperNames: string[]): string[] {
        const out: string[] = [];
        for (const w of wrapperNames) {
          const wrap = block.match(new RegExp(`<${w}\\b[^>]*>([\\s\\S]*?)<\\/${w}>`, "i"));
          if (!wrap) continue;
          const inner = wrap[1];
          const urlMatches = inner.match(/https?:\/\/[^\s<>"']+\.(?:jpg|jpeg|png|webp|gif)/gi) || [];
          out.push(...urlMatches);
        }
        // Fallback: any image URL anywhere in the block.
        if (!out.length) {
          const urlMatches = block.match(/https?:\/\/[^\s<>"']+\.(?:jpg|jpeg|png|webp|gif)/gi) || [];
          out.push(...urlMatches);
        }
        return Array.from(new Set(out));
      }

      const blockRegex = /<(property|listing|item|neches|nechess|asset|ad|advert)\b[^>]*>([\s\S]*?)<\/\1>/gi;
      const items: any[] = [];
      let m: RegExpExecArray | null;
      while ((m = blockRegex.exec(xmlText)) !== null) {
        const block = m[2];
        const photos = pickAllUrls(block, ["images", "pictures", "photos", "tmunot", "media"]);
        const homely_id = pickTag(block, ["id", "propertyid", "listingid", "nechesid", "serial", "sidur", "code"]);
        items.push({
          homely_id: homely_id || String(items.length + 1),
          title: pickTag(block, ["title", "kotert", "name", "headline"]),
          description: pickTag(block, ["description", "tiur", "remarks", "summary"]),
          price: Number(pickTag(block, ["price", "mehir", "askingprice"]).replace(/[^\d.]/g, "")) || 0,
          city: pickTag(block, ["city", "ir", "town"]),
          address: pickTag(block, ["address", "ktovet", "street"]),
          rooms: Number(pickTag(block, ["rooms", "hadarim", "bedrooms"]).replace(/[^\d.]/g, "")) || 0,
          sqm: Number(pickTag(block, ["size", "sqm", "shetach", "area"]).replace(/[^\d.]/g, "")) || 0,
          floor: Number(pickTag(block, ["floor", "koma"]).replace(/[^\d.]/g, "")) || 0,
          photo: photos[0] ?? null,
          raw: { _xml_block: block.slice(0, 2000), photos },
        });
      }

      console.log(`[homely-fetch-property] Parsed ${items.length} property blocks from feed`);

      return json({
        ok: true,
        source: "xml_feed",
        feed_url: feedUrl,
        http_status: httpStatus,
        count: items.length,
        properties: items,
        empty: items.length === 0,
        message: items.length === 0
          ? "התחברות הצליחה, לא נמצאו נכסים בפיד ה‑XML של הומלי."
          : undefined,
      });
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

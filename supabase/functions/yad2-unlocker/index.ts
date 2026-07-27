// yad2-unlocker
// Scrapes Yad2 real-estate pages via the Bright Data Web Unlocker REST API
// (https://api.brightdata.com/request) with zone "yad2". Bypasses bot/CAPTCHA
// automatically. Handles both single item URLs and search-results URLs.
//
// Request body:
//   { "url": "https://www.yad2.co.il/realestate/item/xxxxx" }        // single
//   { "url": "https://www.yad2.co.il/realestate/forsale?city=6400", "limit": 40 }  // search
//
// Required secret: BRIGHTDATA_API_TOKEN
// Optional secret: BRIGHTDATA_ZONE (defaults to "yad2")

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import * as cheerio from "npm:cheerio@1.0.0-rc.12";
import puppeteer from "npm:puppeteer-core@22.15.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const BD_TOKEN = Deno.env.get("BRIGHTDATA_API_TOKEN") ?? "";
const BD_ZONE = Deno.env.get("BRIGHTDATA_ZONE") ?? "yad2";
const BD_WS = Deno.env.get("BRIGHTDATA_WS_ENDPOINT") ?? "";

type DealType = "sale" | "rent";

// Yad2 uses numeric area+city codes for its structured search filters.
// This table mirrors yad2-search/index.ts and covers Udi's primary zones
// plus the major Israeli cities Realtyz users search most often. When a
// city isn't listed we fall back to a `text` query.
const YAD2_CITY_CODES: Record<string, { area: string; city: string }> = {
  "הרצליה": { area: "18", city: "6400" },
  "רמת השרון": { area: "18", city: "2650" },
  "תל אביב": { area: "2", city: "5000" },
  "תל אביב-יפו": { area: "2", city: "5000" },
  "רמת גן": { area: "3", city: "8600" },
  "גבעתיים": { area: "3", city: "6300" },
  "רעננה": { area: "18", city: "8700" },
  "כפר סבא": { area: "18", city: "6900" },
  "נתניה": { area: "19", city: "7400" },
  "פתח תקווה": { area: "3", city: "7900" },
  "ראשון לציון": { area: "5", city: "8300" },
  "חולון": { area: "5", city: "6600" },
  "בת ים": { area: "5", city: "6200" },
  "חיפה": { area: "75", city: "4000" },
  "ירושלים": { area: "1", city: "3000" },
  "באר שבע": { area: "7", city: "9000" },
  "מודיעין": { area: "1", city: "1200" },
  "אשדוד": { area: "6", city: "0070" },
};


function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function detectDealType(url: string): DealType {
  const u = url.toLowerCase();
  if (/\/(forrent|rent)(\b|\/|\?)/.test(u) || /realestate\/rent/.test(u)) return "rent";
  return "sale";
}

function toInt(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}
function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function clean(s: string | null | undefined): string | null {
  const t = (s ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return t || null;
}


// HTTP/1.1-pinned client for api.brightdata.com (see brightDataRequest below).
// `Deno.createHttpClient` is unstable-gated; guard so the function still boots
// if the runtime doesn't expose it.
let bdHttpClient: unknown = null;
try {
  const create = (Deno as unknown as {
    createHttpClient?: (o: Record<string, unknown>) => unknown;
  }).createHttpClient;
  if (typeof create === "function") {
    bdHttpClient = create({ http1: true, http2: false });
    console.log("[yad2-unlocker] using HTTP/1.1-pinned Bright Data client");
  } else {
    console.warn("[yad2-unlocker] Deno.createHttpClient unavailable — using default fetch");
  }
} catch (e) {
  console.warn(`[yad2-unlocker] createHttpClient failed: ${String((e as Error)?.message ?? e)}`);
}


// Bright Data Web Unlocker transport.
//
// NOTE (2026-07 audit): the previous implementation used `node:https`, which in
// the Deno edge runtime resolved with `status=200 bytes=0` for EVERY request —
// the response stream was never delivered, so the parser always saw an empty
// body and every search silently returned zero results. Native `fetch` handles
// TLS/HTTP2 + content-encoding correctly, so we use that instead.
//
// Bright Data's /request API validates `headers` as a plain OBJECT
// (array-of-strings returns `"headers" must be of type object`, 400).
async function brightDataRequest(
  url: string,
  opts: { accept?: string } = {},
): Promise<{ status: number; body: string; bdHeaders: Record<string, string> }> {
  const forwardedAccept = opts.accept ??
    "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8";
  const isGateway = /(^|\/\/)gw\.yad2\.co\.il/i.test(url);

  const forwarded: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": forwardedAccept,
    "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://www.yad2.co.il/",
    "sec-ch-ua": '"Chromium";v="126", "Not.A/Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
  };
  if (isGateway) {
    // XHR-style fingerprint for the JSON gateway.
    forwarded["Origin"] = "https://www.yad2.co.il";
    forwarded["Sec-Fetch-Dest"] = "empty";
    forwarded["Sec-Fetch-Mode"] = "cors";
    forwarded["Sec-Fetch-Site"] = "same-site";
    forwarded["mainsite_user_token"] = "";
  } else {
    // Top-level document fingerprint for www HTML pages. Sending
    // Sec-Fetch-Mode: cors on a document request is a bot tell.
    forwarded["Sec-Fetch-Dest"] = "document";
    forwarded["Sec-Fetch-Mode"] = "navigate";
    forwarded["Sec-Fetch-Site"] = "none";
    forwarded["Upgrade-Insecure-Requests"] = "1";
  }

  const payload = {
    zone: BD_ZONE,
    url,
    format: "raw",
    country: "il",
    method: "GET",
    headers: forwarded,
  };

  // api.brightdata.com negotiates HTTP/2, and Deno's h2 client reliably dies
  // with "stream error detected: unspecific protocol error" against it. Pin
  // the connection to HTTP/1.1 via a custom HTTP client when the runtime
  // exposes one; fall back to plain fetch otherwise.
  const res = await fetch("https://api.brightdata.com/request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BD_TOKEN}`,
      Accept: "*/*",
      // Discourage h2 upgrade on the fallback path.
      Connection: "close",
    },
    body: JSON.stringify(payload),
    ...(bdHttpClient ? { client: bdHttpClient } : {}),
  } as RequestInit);
  const body = await res.text();
  const bdHeaders: Record<string, string> = {};
  for (const [k, v] of res.headers.entries()) {
    if (/^(content-type|content-length|content-encoding|x-brd|x-luminati|x-response|x-unblock)/i.test(k)) {
      bdHeaders[k] = v;
    }
  }
  return { status: res.status, body, bdHeaders };
}

// Bright Data returns 200 with an EMPTY body and an `x-brd-err-code` header
// when the configured zone is the wrong product type. client_10090 =
// "Scraping Browser zone used as a regular proxy" — permanent config error,
// never worth retrying, and the exact reason Yad2 search silently returned
// zero results.
// Once we've seen client_10090 we know the REST Web Unlocker path is dead for
// this deployment. Remember it for the lifetime of the isolate so subsequent
// searches jump straight to the browser transport instead of burning ~4s on
// four guaranteed-to-fail endpoints.
let bdZoneBroken = false;

function zoneModeError(bdHeaders: Record<string, string>): string | null {
  const code = bdHeaders["x-brd-err-code"] ?? "";
  const msg = bdHeaders["x-brd-err-msg"] ?? bdHeaders["x-brd-error"] ?? "";
  if (!code && !msg) return null;
  return `${code || "brd_error"}: ${msg}`;
}


// Rolling trace of every Bright Data hop in the current invocation. Returned
// to the caller so a zero-result search is never silent — you always see the
// exact status codes, byte counts and body previews that produced it.
export type BdTrace = {
  url: string;
  bd_status: number;
  bytes: number;
  content_type?: string;
  preview: string;
  attempt: number;
};
let bdTrace: BdTrace[] = [];

async function unlock(
  url: string,
  opts: { accept?: string; maxAttempts?: number } = {},
): Promise<string> {
  if (bdZoneBroken && BD_WS) {
    // Known-bad REST zone + a usable browser endpoint: fail instantly so the
    // caller falls through to the Scraping Browser transport.
    throw new Error("brightdata_zone_mode: client_10090 (cached) — skipping REST unlocker");
  }
  if (!BD_TOKEN) throw new Error("BRIGHTDATA_API_TOKEN is not configured");
  const maxAttempts = opts.maxAttempts ?? 4;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { status, body, bdHeaders } = await brightDataRequest(url, { accept: opts.accept });
      const zoneErr = zoneModeError(bdHeaders);
      // Explicit direct-fetch diagnostics — surface Bright Data / Yad2 status
      // and a preview of the upstream body so proxy blocks, CAPTCHAs, and
      // empty gateway payloads are visible in Supabase logs.
      const entry: BdTrace = {
        url,
        bd_status: status,
        bytes: body.length,
        content_type: bdHeaders["content-type"],
        preview: body.slice(0, 300),
        attempt,
      };
      if (bdTrace.length < 20) bdTrace.push(entry);
      console.log(
        `[yad2-unlocker] direct-fetch ${url} → BD status=${status} bytes=${body.length} ct=${bdHeaders["content-type"] ?? "-"} hdrs=${JSON.stringify(bdHeaders)} preview=${JSON.stringify(body.slice(0, 300))}`,
      );
      if (zoneErr) {
        // Permanent configuration fault — fail fast so the caller can switch
        // transports instead of burning 4 retries per endpoint.
        if (/client_10090/.test(zoneErr)) bdZoneBroken = true;
        const e = new Error(`brightdata_zone_mode: ${zoneErr}`);
        (e as Error & { permanent?: boolean }).permanent = true;
        throw e;
      }
      if (status >= 200 && status < 300) {
        // A 2xx with an empty body means the unlocker handed back nothing —
        // treat it as a failure instead of "0 results", which is what made
        // this pipeline fail silently for so long.
        if (!body.trim()) {
          if (attempt < maxAttempts) {
            console.warn(`[yad2-unlocker] BD 200 but EMPTY body, attempt ${attempt} for ${url}, retrying`);
            await new Promise((r) => setTimeout(r, 600 * attempt));
            continue;
          }
          throw new Error(`Bright Data returned 200 with an empty body for ${url} (zone="${BD_ZONE}")`);
        }
        return body;
      }
      if ((status >= 500 || status === 429 || status === 403) && attempt < maxAttempts) {
        console.warn(`[yad2-unlocker] BD ${status} attempt ${attempt} for ${url}, retrying`);
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      throw new Error(`Bright Data ${status} for ${url}: ${body.slice(0, 400)}`);
    } catch (e) {
      lastErr = e;
      const msg = String((e as Error)?.message ?? e);
      if ((e as Error & { permanent?: boolean })?.permanent) throw e;
      const transient = /http2|stream error|SendRequest|network|reset|ECONNRESET|EOF|timeout|socket hang up/i.test(msg);
      if (!transient || attempt >= maxAttempts) throw e;
      console.warn(`[yad2-unlocker] transient error attempt ${attempt} for ${url}: ${msg.slice(0, 200)}`);
      await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// -------- Yad2 internal JSON gateway --------
//
// The Yad2 SPA talks to https://gw.yad2.co.il/*, which returns plain JSON and
// has NO client-side hydration to wait for. We route through Bright Data to
// bypass Radware bot protection but consume the structured payload directly,
// no DOM parsing needed. Two endpoints in priority order:
//   1) https://gw.yad2.co.il/realestate-feed/{forsale|rent}/feed?<qs>
//   2) https://gw.yad2.co.il/feed-search-legacy/realestate/{forsale|rent}?<qs>  (fallback)
// Item detail (single ad):
//   https://gw.yad2.co.il/realestate-feed/item/{token}

function toGatewayFeedUrls(inputUrl: string): string[] {
  const u = new URL(inputUrl);
  const deal: "forsale" | "rent" =
    /forrent|rent/i.test(u.pathname) ? "rent" : "forsale";
  // Preserve the query-string the front-end already built (text=, city=, rooms=, ...).
  const qs = u.search ? u.search : "";
  // Endpoint variants in priority order. The Yad2 SPA currently hits
  // `/realestate-feed/{deal}` (no /feed suffix) — the /feed and
  // /feed-search-legacy paths remain as fallbacks in case Yad2 flips CDN
  // routing again. We try all three so a rename on Yad2's side doesn't
  // silently kill the pipeline.
  return [
    `https://gw.yad2.co.il/realestate-feed/${deal}${qs}`,
    `https://gw.yad2.co.il/realestate-feed/${deal}/feed${qs}`,
    `https://gw.yad2.co.il/feed-search-legacy/realestate/${deal}${qs}`,
  ];
}

function toGatewayItemUrl(inputUrl: string): string | null {
  const m = inputUrl.match(/\/realestate\/item\/(?:[a-z-]+\/)?([a-z0-9]+)/i);
  if (!m) return null;
  return `https://gw.yad2.co.il/realestate-feed/item/${m[1]}`;
}

function normalizePhotoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let u = value.trim().replace(/\\u002F/g, "/").replace(/&amp;/g, "&");
  if (u.startsWith("//")) u = `https:${u}`;
  if (u.startsWith("/")) u = `https://www.yad2.co.il${u}`;
  if (!/^https?:\/\//i.test(u)) return null;
  if (/placeholder|default|no[-_]?image|logo|sprite|icon|blank\.(gif|png|jpg)/i.test(u)) return null;
  const imageLike = /\.(?:jpe?g|png|webp|avif)(?:[?#]|$)/i.test(u) || /(?:img|images|assets)\.yad2\.co\.il/i.test(u);
  return imageLike ? u : null;
}

function pickPhotos(raw: any): string[] {
  const out: string[] = [];
  const seenObjects = new WeakSet<object>();
  const push = (v: unknown) => {
    const u = normalizePhotoUrl(v);
    if (u) out.push(u);
  };
  const walk = (node: unknown, depth = 0) => {
    if (node == null || depth > 8 || out.length > 300) return;
    if (typeof node === "string") {
      push(node);
      const matches = node.match(/(?:https?:)?\/\/[^\s"'<>\\]+(?:\.(?:jpe?g|png|webp|avif)|yad2[^\s"'<>\\]*)[^\s"'<>\\]*/gi) ?? [];
      for (const m of matches) push(m);
      return;
    }
    if (typeof node !== "object") return;
    if (seenObjects.has(node as object)) return;
    seenObjects.add(node as object);
    if (Array.isArray(node)) {
      for (const v of node) walk(v, depth + 1);
      return;
    }
    const rec = node as Record<string, unknown>;
    push(rec.src ?? rec.url ?? rec.image_url ?? rec.imageUrl ?? rec.image ?? rec.photo ?? rec.href);
    for (const v of Object.values(rec)) walk(v, depth + 1);
  };
  walk(raw);
  const seen = new Set<string>();
  return out.filter((u) => {
    const key = u.split("?")[0].replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Merges every image container Yad2 ships so we keep the FULL gallery. */
function pickAllPhotos(...raws: any[]): string[] {
  const out: string[] = [];
  for (const raw of raws) out.push(...pickPhotos(raw));
  return Array.from(new Set(out)).slice(0, 40);
}

/** Normalises Yad2 availability wording / dates into an ISO date string. */
function pickAvailableFrom(it: any): string | null {
  const raw =
    it?.availableFrom ?? it?.available_from ?? it?.entryDate ?? it?.entry_date ??
    it?.additionalDetails?.entranceDate ?? it?.additionalDetails?.availableFrom ??
    it?.dates?.entrance ?? null;
  if (!raw) return null;
  if (typeof raw === "string") {
    if (/מיידי|immediate|גמיש/i.test(raw)) return new Date().toISOString().slice(0, 10);
    const iso = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    if (iso) return iso;
    const dmy = raw.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    return null;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Parses any Yad2 date shape (ISO, dd/MM/yy, dd/MM/yyyy, epoch) to ISO. */
function toIsoDate(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const s = String(raw).trim();
  if (!s) return null;
  const iso = s.match(/\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+)?/)?.[0];
  if (iso) {
    const d = new Date(iso.replace(" ", "T"));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const dmy = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (dmy) {
    const yy = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    const d = new Date(`${yy}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Original publication date of the ad ("פורסם ב-"), plus the last source
 * update. Yad2 exposes these under `dates.*` on the gateway feed and as free
 * text on the rendered item page.
 */
function pickListingDates(it: any): { published_at: string | null; updated_at_source: string | null } {
  const dts = it?.dates ?? it?.date ?? {};
  const published = toIsoDate(
    dts?.createdAt ?? dts?.created_at ?? dts?.publishedAt ?? dts?.published_at ??
    dts?.uploadDate ?? dts?.upload_date ?? dts?.firstPublished ??
    it?.createdAt ?? it?.created_at ?? it?.publishedAt ?? it?.published_at ??
    it?.uploadDate ?? it?.upload_date ?? it?.date_added ?? it?.metaData?.publishedAt ?? null,
  );
  const updated = toIsoDate(
    dts?.updatedAt ?? dts?.updated_at ?? dts?.modifiedAt ?? dts?.lastUpdated ??
    it?.updatedAt ?? it?.updated_at ?? it?.date_modified ?? null,
  );
  return { published_at: published, updated_at_source: updated };
}

/** "פורסם ב 18/07/26" fallback straight off the rendered item page. */
function publishedFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = String(text).match(/פורסם\s*ב[-\s]*(\d{1,2}[./]\d{1,2}[./]\d{2,4})/);
  return m ? toIsoDate(m[1]) : null;
}

/** Last-resort house/apartment numbers parsed out of the ad's address text. */
function addressNumbersFromText(...texts: Array<string | null | undefined>): {
  house_number: string | null;
  apartment_number: string | null;
} {
  let house: string | null = null;
  let apt: string | null = null;
  for (const t of texts) {
    const s = String(t ?? "").replace(/\s+/g, " ").trim();
    if (!s) continue;
    if (!apt) {
      const m = s.match(/(?:דירה|דירת|יח["׳']?|apt\.?|apartment|unit|#)\s*(\d{1,4}[א-תA-Za-z]?)/i);
      if (m) apt = m[1];
    }
    if (!house) {
      const head = s.split(/(?:,|\s)+(?:דירה|דירת|יח["׳']?|apt\.?|apartment|unit|#)/i)[0]
        // Never mistake a unit value (חדרים / מ"ר / קומה) for a house number.
        .replace(/\d+(?:[.,]\d+)?\s*(?:חדרים|חדר|מ["״׳]?ר|מטר|קומה|קומות)/g, " ");
      const m = head.match(/(?:^|[^\d])(\d{1,4}[א-תA-Za-z]?)(?!\s*(?:חדרים|חדר|מ["״׳]?ר|קומה))(?:\s|,|$)/);
      if (m) house = m[1];
    }
    if (house && apt) break;
  }
  return { house_number: house, apartment_number: apt };
}



/** Collects every scalar custom attribute Yad2 exposes for the ad. */
function pickAttributes(it: any): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  const merge = (src: any) => {
    if (!src || typeof src !== "object" || Array.isArray(src)) return;
    for (const [k, v] of Object.entries(src)) {
      if (v == null || v === "") continue;
      if (typeof v === "object") continue;
      attrs[k] = v;
    }
  };
  merge(it?.additionalDetails);
  merge(it?.additionalDetails?.property);
  merge(it?.metaData);
  merge(it?.inProperty);
  merge(it?.propertyDetails);
  if (Array.isArray(it?.tags)) attrs.tags = it.tags.map((t: any) => (typeof t === "string" ? t : t?.name)).filter(Boolean);
  if (Array.isArray(it?.inProperty)) {
    attrs.in_property = it.inProperty.map((t: any) => (typeof t === "string" ? t : t?.name ?? t?.key)).filter(Boolean);
  }
  delete (attrs as any).images;
  delete (attrs as any).coverImage;
  return attrs;
}

/** Latitude / longitude from any of Yad2's coordinate shapes. */
function pickCoords(it: any): { lat: number | null; lng: number | null } {
  const cands = [
    it?.address?.coords,
    it?.address?.coordinates,
    it?.coords,
    it?.coordinates,
    it?.location,
    it?.metaData?.coords,
    it,
  ];
  for (const c of cands) {
    if (!c || typeof c !== "object") continue;
    const lat = toNum(c.lat ?? c.latitude ?? c.y ?? null);
    const lng = toNum(c.lon ?? c.lng ?? c.long ?? c.longitude ?? c.x ?? null);
    if (lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)) {
      return { lat, lng };
    }
  }
  return { lat: null, lng: null };
}

/**
 * House number (מספר בית) + apartment number (מספר דירה). Yad2 exposes these
 * under `address.house.{number,floor,apartment}` on the item feed, and only as
 * free text inside the street line on some legacy shapes.
 */
function pickAddressNumbers(it: any, addressText?: string | null): {
  house_number: string | null;
  apartment_number: string | null;
} {
  const pick = (...vals: any[]): string | null => {
    for (const v of vals) {
      if (v == null) continue;
      const s = String(v).trim();
      if (s && s !== "0" && s.toLowerCase() !== "null") return s;
    }
    return null;
  };
  const h = it?.address?.house ?? it?.house ?? {};
  let house = pick(
    h?.number, h?.houseNumber, h?.house_number,
    it?.address?.houseNumber, it?.address?.house_number, it?.address?.number,
    it?.houseNumber, it?.house_number, it?.streetNumber, it?.street_number,
    it?.additionalDetails?.houseNumber, it?.additionalDetails?.house_number,
  );
  let apt = pick(
    h?.apartment, h?.apartmentNumber, h?.apartment_number, h?.flat, h?.unit,
    it?.address?.apartmentNumber, it?.address?.apartment_number, it?.address?.apartment,
    it?.apartmentNumber, it?.apartment_number, it?.apartment, it?.unit, it?.unitNumber,
    it?.additionalDetails?.apartmentNumber, it?.additionalDetails?.apartment_number,
  );

  // Deep key hunt across the whole payload (endpoint shapes vary a lot).
  if (!house) house = normNum(deepFindByKey(it, HOUSE_NUM_KEY_RE));
  if (!apt) apt = normNum(deepFindByKey(it, APT_NUM_KEY_RE));

  const addr = clean(addressText ?? it?.address?.street?.text ?? it?.street ?? null) ?? "";
  if (!apt) {
    const marked = addr.match(/(?:דירה|דירת|יח["׳']?|apt\.?|apartment|unit|#)\s*(\d{1,4}[א-תA-Za-z]?)/i);
    if (marked) apt = marked[1];
    else {
      // Bare second numeric group: "הפסנתר 8 16" → apartment 16.
      const tail = addr.match(/\d{1,4}[א-תA-Za-z]?\s+(\d{1,4}[א-תA-Za-z]?)\s*$/);
      if (tail) apt = tail[1];
    }
  }
  if (!house) {
    const head = addr.split(/(?:,|\s)+(?:דירה|דירת|יח["׳']?|apt\.?|apartment|unit|#)/i)[0];
    const m = head.match(/(\d{1,4}[א-תA-Za-z]?)(?=\s|,|$)/);
    if (m) house = m[1];
  }
  return { house_number: house, apartment_number: apt };
}

/** Accepts only short, number-like values (Yad2 sometimes nests {value:"12"}). */
function normNum(v: unknown): string | null {
  if (v == null || typeof v === "object") return null;
  const s = String(v).trim();
  if (!s || s === "0" || s.toLowerCase() === "null") return null;
  return /^\d{1,4}[א-תA-Za-z]?$/.test(s) ? s : null;
}

const HOUSE_NUM_KEY_RE = /^(house_?number|houseNum|building_?number|street_?number|bldg_?number)$/i;
const APT_NUM_KEY_RE = /^(apartment_?number|apartmentNum|apt_?number|flat_?number|unit_?number)$/i;

/**
 * DOM fallback: Yad2 renders the address in the item header (h1 / address
 * breakdown) and repeats מספר בית / מספר דירה inside the details rows.
 */
function addressNumbersFromHtml($: any, bodyText: string): {
  house_number: string | null;
  apartment_number: string | null;
} {
  let house: string | null = null;
  let apt: string | null = null;
  if ($) {
    const headerSelectors = [
      "h1",
      '[data-testid="address"]',
      '[data-nagish="item-address"]',
      '[class*="address" i]',
      '[class*="title" i] h1',
      "header h1",
    ];
    for (const sel of headerSelectors) {
      if (house && apt) break;
      try {
        $(sel).each((_: number, el: any) => {
          if (house && apt) return;
          const t = clean($(el).text());
          if (!t || t.length > 160) return;
          const n = pickAddressNumbers({}, t);
          house = house ?? n.house_number;
          apt = apt ?? n.apartment_number;
        });
      } catch { /* ignore */ }
    }
    // Explicit labelled rows anywhere in the details tables.
    try {
      $("li,tr,dl,div,span").each((_: number, el: any) => {
        if (house && apt) return;
        const t = clean($(el).text());
        if (!t || t.length > 60) return;
        if (!house) {
          const m = t.match(/מספר\s*(?:בית|בנין|בניין)\s*[:\-]?\s*(\d{1,4}[א-ת]?)/);
          if (m) house = m[1];
        }
        if (!apt) {
          const m = t.match(/(?:מספר\s*דירה|דירה\s*מס['׳]?)\s*[:\-]?\s*(\d{1,4}[א-ת]?)/);
          if (m) apt = m[1];
        }
      });
    } catch { /* ignore */ }
  }
  const txt = String(bodyText ?? "").replace(/\s+/g, " ");
  if (!house) house = txt.match(/מספר\s*(?:בית|בנין|בניין)\s*[:\-]?\s*(\d{1,4}[א-ת]?)/)?.[1] ?? null;
  if (!apt) apt = txt.match(/(?:מספר\s*דירה|דירה\s*מס['׳]?)\s*[:\-]?\s*(\d{1,4}[א-ת]?)/)?.[1] ?? null;
  return { house_number: house, apartment_number: apt };
}

/**
 * DOM fallback for the money rows Yad2 prints under "פרטים נוספים":
 * ארנונה, ועד בית, מספר תשלומים, and the entrance date.
 */
function financialsFromHtml($: any, bodyText: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const txt = String(bodyText ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const grab = (re: RegExp): string | null => {
    const m = txt.match(re);
    return m ? m[1].replace(/,/g, "").trim() : null;
  };
  // Label/value pairs first — cheaper and far more accurate than page-wide regex.
  if ($) {
    try {
      $("li,tr,dl,div").each((_: number, el: any) => {
        const t = clean($(el).text());
        if (!t || t.length > 80) return;
        const pair = (label: RegExp, key: string) => {
          if (out[key] != null) return;
          const m = t.match(label);
          if (m) out[key] = m[1].replace(/,/g, "").trim();
        };
        pair(/ארנונה[^\d]{0,12}([\d,]{2,9})/, "arnona");
        pair(/ועד\s*בית[^\d]{0,12}([\d,]{1,7})/, "vaadBayit");
        pair(/(?:מספר\s*תשלומים|תשלומים)[^\d]{0,12}(\d{1,2})/, "paymentsCount");
      });
    } catch { /* ignore */ }
  }
  if (out.arnona == null) { const v = grab(/ארנונה[^\d]{0,12}([\d,]{2,9})/); if (v) out.arnona = v; }
  if (out.vaadBayit == null) { const v = grab(/ועד\s*בית[^\d]{0,12}([\d,]{1,7})/); if (v) out.vaadBayit = v; }
  if (out.paymentsCount == null) { const v = grab(/(?:מספר\s*תשלומים|תשלומים)[^\d]{0,12}(\d{1,2})/); if (v) out.paymentsCount = v; }
  const entrance = txt.match(/תאריך\s*כניסה\s*[:\-]?\s*([^|<]{3,24}?)(?:\s{2,}|$|\s(?:ארנונה|ועד|מספר))/);
  if (entrance) out.entranceDate = entrance[1].trim();
  return out;
}


/**
 * "על הנכס" — Yad2 hides the free-text description under several different
 * keys depending on the endpoint/version (`description`, `info_text`,
 * `freeText`, `adDescription`, `metaData.longDescription`, ...). Walk the
 * whole payload and keep the longest human-looking text we find so the
 * description is never lost.
 *
 * Guard: SEO / meta / breadcrumb blocks contain long *location* strings
 * ("דירה למכירה ברחוב ... הרצליה | יד2") that used to win the "longest text"
 * race and replace the real description. Those keys and value shapes are
 * rejected outright.
 */
const DESC_KEY_RE = /(description|info_?text|free_?text|about|remarks|comments?|body_?text|ad_?text)/i;
const DESC_KEY_DENY_RE = /(seo|meta_?title|metaDescription|og_?|breadcrumb|share|canonical|page_?title|schema|alt|image|agency|office|contact|category|sub_?title|short)/i;
const DESC_VALUE_DENY_RE =
  /(יד ?2|yad2\.co\.il|\|\s*יד|כל הזכויות שמורות|לוח מודעות|נדל"ן\s*[-|]|תנאי שימוש|מדיניות פרטיות)/i;

/** Location-ish boilerplate, e.g. "דירה למכירה, הרצליה, בן יהודה 27". */
function looksLikeLocationString(v: string): boolean {
  if (/[.!?]/.test(v) && v.length > 80) return false; // real prose
  const commas = (v.match(/,/g) ?? []).length;
  if (commas >= 2 && v.length < 120) return true;
  return /^(דירה|בית|פנטהאוז|מגרש|נכס)\s+(למכירה|להשכרה)\b/.test(v) && v.length < 120;
}

function deepDescription(obj: any, depth = 0): string | null {
  if (!obj || depth > 6) return null;
  let best: string | null = null;
  const consider = (s: unknown) => {
    const v = clean(typeof s === "string" ? s : null);
    if (!v || v.length < 25) return;
    if (/^https?:\/\//i.test(v)) return;
    if (DESC_VALUE_DENY_RE.test(v)) return;
    if (looksLikeLocationString(v)) return;
    if (!best || v.length > best.length) best = v;
  };
  if (Array.isArray(obj)) {
    for (const x of obj) {
      const found = deepDescription(x, depth + 1);
      consider(found);
    }
    return best;
  }
  if (typeof obj !== "object") return null;
  for (const [k, v] of Object.entries(obj)) {
    if (DESC_KEY_DENY_RE.test(k)) continue;
    if (typeof v === "string") {
      if (DESC_KEY_RE.test(k)) consider(v);
    } else if (v && typeof v === "object") {
      consider(deepDescription(v, depth + 1));
    }
  }
  return best;
}

/** HTML fallback: pull the text that sits under the "על הנכס" heading. */
function descriptionFromHtml($: any): string | null {
  if (!$) return null;
  const accept = (s: string | null | undefined, min = 25): string | null => {
    const v = clean(s ?? null);
    if (!v || v.length < min) return null;
    if (DESC_VALUE_DENY_RE.test(v)) return null;
    if (looksLikeLocationString(v)) return null;
    return v.replace(/^על הנכס\s*/, "").trim() || null;
  };

  // 1. Exact "על הנכס" heading → its sibling / container body. This is the
  //    authoritative block; never fall through to generic text if it exists.
  try {
    let exact: string | null = null;
    $("h1,h2,h3,h4,span,div").each((_: number, el: any) => {
      if (exact) return;
      const node = $(el);
      const heading = clean(node.text());
      if (!heading || !/^על הנכס\s*$/.test(heading)) return;
      exact =
        accept(node.next().text()) ||
        accept(node.parent().next().text()) ||
        accept(node.parent().text());
    });
    if (exact) return exact;
  } catch { /* cheerio shape mismatch — ignore */ }

  // 2. Explicit description containers.
  try {
    let byTestId: string | null = null;
    $('[data-testid*="description" i], [class*="description" i], [class*="about" i]').each(
      (_: number, el: any) => {
        const body = accept($(el).text(), 40);
        if (body && (!byTestId || body.length > byTestId.length)) byTestId = body;
      },
    );
    if (byTestId) return byTestId;
  } catch { /* ignore */ }

  // 3. Last resort: longest paragraph-like block on the page.
  let found: string | null = null;
  try {
    $("p").each((_: number, el: any) => {
      const body = accept($(el).text(), 60);
      if (body && (!found || body.length > found.length)) found = body;
    });
  } catch { /* ignore */ }
  return found;
}

/**
 * Recursively hunt a numeric/short-text value by key across the whole payload.
 * Yad2 nests ארנונה / ועד בית / מספר תשלומים under different parents per
 * endpoint (`additionalDetails`, `priceDetails`, `payments`, `terms`, ...).
 */
function deepFindByKey(obj: any, keyRe: RegExp, depth = 0): unknown {
  if (!obj || typeof obj !== "object" || depth > 6) return null;
  const entries = Array.isArray(obj) ? obj.map((v, i) => [String(i), v] as const) : Object.entries(obj);
  for (const [k, v] of entries) {
    if (keyRe.test(k)) {
      if (v == null || v === "") continue;
      if (typeof v === "object") {
        const inner = (v as any).value ?? (v as any).text ?? (v as any).amount ?? (v as any).price;
        if (inner != null && inner !== "" && typeof inner !== "object") return inner;
        continue;
      }
      return v;
    }
  }
  for (const [, v] of entries) {
    if (v && typeof v === "object") {
      const found = deepFindByKey(v, keyRe, depth + 1);
      if (found != null && found !== "") return found;
    }
  }
  return null;
}

const ARNONA_KEY_RE = /^(arnona|municipal_?tax|propertyTax|city_?tax)$/i;
const VAAD_KEY_RE = /^(vaad_?bayit|house_?committee|houseCommitteeFee|maintenance_?fee|committee)$/i;
const PAYMENTS_KEY_RE = /^(payments_?count|num_?of_?payments|numberOfPayments|paymentsNumber|monthly_?payments)$/i;


/** "פירוט הריהוט" — furniture inventory block. */
function pickFurniture(it: any): Record<string, unknown> {
  const src =
    it?.furniture ?? it?.additionalDetails?.furniture ?? it?.inProperty?.furniture ??
    it?.propertyDetails?.furniture ?? null;
  const out: Record<string, unknown> = {};
  if (src && typeof src === "object" && !Array.isArray(src)) {
    for (const [k, v] of Object.entries(src)) {
      if (v == null || v === "") continue;
      out[k] = typeof v === "object" ? JSON.stringify(v) : v;
    }
  } else if (Array.isArray(src)) {
    out.items = src.map((x: any) => (typeof x === "string" ? x : x?.name ?? x?.text ?? x?.key)).filter(Boolean);
  } else if (typeof src === "string" && src.trim()) {
    out.note = src.trim();
  }
  const note = clean(it?.furnitureDescription ?? it?.additionalDetails?.furnitureDescription ?? null);
  if (note) out.note = note;
  return out;
}

/** "פרטים נוספים" — elevator / parking / MAMAD / balcony style specs. */
function pickAdditionalDetails(it: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const collect = (src: any) => {
    if (!src) return;
    if (Array.isArray(src)) {
      for (const x of src) {
        if (typeof x === "string") out[x] = true;
        else if (x && typeof x === "object") {
          const key = x.key ?? x.name ?? x.title ?? x.label;
          if (key) out[String(key)] = x.value ?? x.text ?? true;
        }
      }
      return;
    }
    if (typeof src === "object") {
      for (const [k, v] of Object.entries(src)) {
        if (v == null || v === "" || typeof v === "object") continue;
        out[k] = v;
      }
    }
  };
  collect(it?.inProperty);
  collect(it?.additionalDetails?.property);
  collect(it?.additionalDetails);
  collect(it?.propertyDetails);
  collect(it?.tags);
  collect(it?.metaData?.additionalDetails);
  collect(it?.priceDetails);
  collect(it?.payments);

  // Canonical Yad2 secondary fields — guaranteed present when the source has
  // them, whatever key shape the endpoint used.
  const first = (...vals: any[]) => {
    for (const v of vals) {
      if (v == null || v === "" || typeof v === "object") continue;
      return v;
    }
    return null;
  };
  const ad = it?.additionalDetails ?? {};
  const canon: Record<string, unknown> = {
    floor: first(out.floor, ad.floor, it?.floor, it?.address?.house?.floor),
    totalFloors: first(out.totalFloors, ad.totalFloors, ad.buildingTopFloor, it?.buildingTopFloor, it?.totalFloors),
    parkingSpacesCount: first(out.parkingSpacesCount, ad.parkingSpacesCount, ad.parkingQuantity, it?.parking, it?.parkingSpaces),
    balconiesCount: first(out.balconiesCount, ad.balconiesCount, ad.balconies, it?.balconies),
    propertyCondition: first(
      out.propertyCondition,
      ad.propertyCondition?.text, ad.propertyCondition,
      it?.propertyCondition?.text, it?.propertyCondition,
      it?.assetCondition,
    ),
    squareMeterBuild: first(out.squareMeterBuild, ad.squareMeterBuild, ad.squareMeter, it?.square_meters),
    arnona: first(out.arnona, ad.arnona, ad.municipalTax, it?.arnona, it?.municipalTax, it?.taxes, deepFindByKey(it, ARNONA_KEY_RE)),
    vaadBayit: first(out.vaadBayit, ad.vaadBayit, ad.houseCommittee, it?.houseCommittee, it?.vaadBayit, deepFindByKey(it, VAAD_KEY_RE)),
    paymentsCount: first(out.paymentsCount, ad.paymentsCount, ad.numOfPayments, it?.numOfPayments, deepFindByKey(it, PAYMENTS_KEY_RE)),
    entranceDate: first(out.entranceDate, ad.entranceDate, it?.entranceDate, it?.dates?.entrance),
    yearBuilt: first(out.yearBuilt, ad.yearBuilt, ad.buildingYear, it?.buildingYear),
  };
  for (const [k, v] of Object.entries(canon)) {
    if (v == null || v === "") continue;
    out[k] = v;
  }

  delete (out as any).images;
  delete (out as any).coverImage;
  return out;
}

/** Value-history graph points Yad2 renders on the item page. */
function pickPriceHistory(it: any): Array<{ date: string | null; price: number | null; label?: string }> {
  const src =
    it?.priceHistory ?? it?.price_history ?? it?.priceList ?? it?.pricesHistory ??
    it?.metaData?.priceHistory ?? it?.valueHistory ?? it?.graph?.points ?? null;
  if (!Array.isArray(src)) return [];
  const out: Array<{ date: string | null; price: number | null; label?: string }> = [];
  for (const p of src) {
    if (!p) continue;
    if (typeof p === "number") { out.push({ date: null, price: Math.round(p) }); continue; }
    if (typeof p !== "object") continue;
    const price = toInt(p.price ?? p.value ?? p.y ?? p.amount ?? null);
    const rawDate = p.date ?? p.updatedAt ?? p.timestamp ?? p.x ?? p.label ?? null;
    let date: string | null = null;
    if (rawDate != null) {
      const s = String(rawDate);
      const iso = s.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      if (iso) date = iso;
      else {
        const dmy = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
        if (dmy) date = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
        else {
          const d = new Date(rawDate as any);
          if (!Number.isNaN(d.getTime())) date = d.toISOString().slice(0, 10);
        }
      }
    }
    if (price == null && date == null) continue;
    out.push({ date, price, label: typeof p.label === "string" ? p.label : undefined });
  }
  return out.slice(0, 40);
}

function feedItemToScraped(it: any, dealType: DealType): Scraped | null {
  const token = it?.token ?? it?.orderId ?? it?.order_id ?? it?.adNumber ?? it?.id ?? null;
  if (!token || typeof token !== "string") return null;
  const href = `https://www.yad2.co.il/realestate/item/${token}`;

  const priceRaw = it?.price ?? it?.priceInShekels ?? it?.metaData?.price ?? null;
  const rooms = toNum(it?.additionalDetails?.roomsCount ?? it?.rooms ?? it?.Rooms_text ?? it?.row_3);
  const sqm = toInt(it?.additionalDetails?.squareMeter ?? it?.square_meters ?? it?.SquareMeter);
  const floor = toInt(it?.additionalDetails?.floor ?? it?.floor);

  const city = clean(it?.address?.city?.text ?? it?.city ?? it?.city_text ?? it?.row_4);
  const neighborhood = clean(it?.address?.neighborhood?.text ?? it?.neighborhood ?? it?.neighborhood_text);
  const address = clean(it?.address?.street?.text ?? it?.street ?? it?.row_2);

  // Full gallery, not just the cover thumbnail.
  const photos = pickAllPhotos(
    it?.metaData?.images,
    it?.images,
    it?.image,
    it?.metaData?.coverImage,
    it?.gallery,
    it?.imagesUrls,
    it?.images?.images,
    it?.media,
    it?.image_urls,
    it?.metaData?.imagesUrls,
  );

  const shortDesc = clean(it?.info_text ?? it?.subtitle ?? it?.metaData?.description ?? null);
  const longDesc = clean(it?.description ?? it?.metaData?.longDescription ?? it?.freeText ?? null)
    ?? deepDescription(it);
  const coords = pickCoords(it);

  return {
    source_url: href,
    external_id: token,
    title: clean(
      it?.title ?? it?.merchandise ?? it?.metaData?.title ?? it?.row_1
        ?? [city, neighborhood].filter(Boolean).join(" · ")
    ),
    price: toInt(priceRaw),
    rooms,
    city,
    neighborhood,
    address,
    ...(() => {
      // Batch mode: resolve house/apartment numbers up-front from the JSON,
      // falling back to the address/title free text so the table is populated
      // immediately at import time (no click-to-hydrate needed).
      const n = pickAddressNumbers(it, address);
      const t = addressNumbersFromText(
        it?.address?.street?.text, address, it?.row_2, it?.title, it?.merchandise, it?.metaData?.title,
      );
      return {
        house_number: n.house_number ?? t.house_number,
        apartment_number: n.apartment_number ?? t.apartment_number,
      };
    })(),
    sqm,
    floor,
    photos,
    deal_type: dealType,
    owner_name: clean(it?.customer?.name ?? it?.merchant_name ?? null),
    owner_phone: clean(it?.customer?.phone ?? null),
    description: longDesc ?? shortDesc,
    short_description: shortDesc,
    long_description: longDesc,
    available_from: pickAvailableFrom(it),
    attributes: pickAttributes(it),
    latitude: coords.lat,
    longitude: coords.lng,
    furniture_details: pickFurniture(it),
    additional_details: pickAdditionalDetails(it),
    price_history: pickPriceHistory(it),
    ...pickListingDates(it),
  };
}

function looksLikeYad2Ad(x: any): boolean {
  if (!x || typeof x !== "object") return false;
  const hasToken = !!(x.token || x.orderId || x.order_id || x.adNumber || x.id || x.ad_id);
  const hasAdShape =
    x.price != null ||
    x.priceInShekels != null ||
    x.metaData != null ||
    x.additionalDetails != null ||
    x.address != null ||
    x.customer != null ||
    x.merchandise != null ||
    x.title != null ||
    x.subcategory != null ||
    x.category_id != null;
  return hasToken && hasAdShape;
}

function extractFeedItems(payload: any): any[] {
  if (!payload || typeof payload !== "object") return [];
  // Yad2 gateway ships several shapes across endpoints. Current live ones:
  //   { data: { private: [...], agency: [...], platinum: [...], commercial: [...], projects: [...], yad1: [...], king: [...] } }
  //   { data: { feed: { feed_items: [...] } } }
  //   { data: { markers: [...] } }
  //   { feed_items: [...] } / { items: [...] } / { data: [...] } (legacy)
  const candidates: any[] = [];
  const push = (v: any) => { if (Array.isArray(v) && v.length) candidates.push(v); };
  const d = payload?.data ?? payload;
  push(d?.feed?.feed_items);
  push(payload?.feed?.feed_items);
  push(d?.markers);
  push(d?.items);
  push(payload?.items);
  push(payload?.feed_items);
  // New "buckets" shape — merge them all so paid + private + agency all count.
  const bucketKeys = ["private", "agency", "platinum", "commercial", "projects", "yad1", "king", "results"];
  const merged: any[] = [];
  for (const k of bucketKeys) if (Array.isArray(d?.[k])) merged.push(...d[k]);
  if (merged.length) candidates.push(merged);
  // Bare arrays as last resort.
  if (Array.isArray(d)) candidates.push(d);
  if (Array.isArray(payload)) candidates.push(payload);

  for (const arr of candidates) {
    const filtered = arr.filter(looksLikeYad2Ad);
    if (filtered.length) return filtered;
  }
  // Recursive fallback: crawl the whole payload for ad-shaped objects.
  // Guards against any future rename in Yad2's response tree.
  const seen = new Set<any>();
  const found: any[] = [];
  const walk = (node: any, depth: number) => {
    if (!node || depth > 6 || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (looksLikeYad2Ad(node)) { found.push(node); return; }
    if (Array.isArray(node)) { for (const v of node) walk(v, depth + 1); return; }
    for (const v of Object.values(node)) walk(v, depth + 1);
  };
  walk(payload, 0);
  return found;
}

function parseSearchJson(body: string, srcUrl: string, limit: number): Scraped[] {
  const dealType = detectDealType(srcUrl);
  let payload: any;
  try { payload = JSON.parse(body); } catch (e) {
    console.warn(`[yad2-unlocker] parseSearchJson: non-JSON body (${body.length} bytes) preview=${JSON.stringify(body.slice(0, 200))}`);
    return [];
  }
  const items = extractFeedItems(payload);
  console.log(`[yad2-unlocker] parseSearchJson: extracted ${items.length} candidate item(s) from payload keys=${
    payload && typeof payload === "object" ? Object.keys(payload).slice(0, 10).join(",") : typeof payload
  }`);
  const out: Scraped[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (out.length >= limit) break;
    const row = feedItemToScraped(it, dealType);
    if (!row) continue;
    if (seen.has(row.source_url)) continue;
    seen.add(row.source_url);
    out.push(row);
  }
  if (items.length && !out.length) {
    console.warn(`[yad2-unlocker] parseSearchJson: ${items.length} candidate(s) matched but none produced a valid Scraped row — first keys=${
      Object.keys(items[0] ?? {}).slice(0, 20).join(",")
    }`);
  }
  return out;
}

function parseItemJson(body: string, srcUrl: string): Scraped | null {
  let payload: any;
  try { payload = JSON.parse(body); } catch { return null; }
  const dealType = detectDealType(srcUrl);
  const ad = payload?.data ?? payload?.ad ?? payload;
  if (!ad || typeof ad !== "object") return null;
  const base = feedItemToScraped(ad, dealType);
  if (!base) return null;
  // Item endpoint carries richer contact info
  base.owner_phone = clean(ad?.customer?.phone ?? ad?.phone_number ?? ad?.merchant_phone ?? base.owner_phone);
  base.owner_name = clean(ad?.customer?.name ?? ad?.merchant_name ?? ad?.contact_name ?? base.owner_name);
  base.long_description = clean(ad?.description ?? ad?.info_text ?? null)
    ?? deepDescription(payload) ?? base.long_description;
  base.short_description = clean(ad?.info_text ?? ad?.subtitle ?? base.short_description);
  base.available_from = pickAvailableFrom(ad) ?? base.available_from ?? null;
  base.attributes = { ...(base.attributes ?? {}), ...pickAttributes(ad) };
  base.photos = pickAllPhotos(base.photos, ad?.images, ad?.metaData?.images, ad?.gallery);
  base.description = base.long_description ?? base.short_description ?? base.description;
  const coords = pickCoords(ad);
  base.latitude = coords.lat ?? base.latitude ?? null;
  base.longitude = coords.lng ?? base.longitude ?? null;
  base.furniture_details = { ...(base.furniture_details ?? {}), ...pickFurniture(ad) };
  base.additional_details = { ...(base.additional_details ?? {}), ...pickAdditionalDetails(ad) };
  const nums = pickAddressNumbers(ad, base.address);
  base.house_number = nums.house_number ?? base.house_number ?? null;
  base.apartment_number = nums.apartment_number ?? base.apartment_number ?? null;
  const hist = pickPriceHistory(ad);
  if (hist.length) base.price_history = hist;
  const dates = pickListingDates(ad);
  base.published_at = dates.published_at ?? base.published_at ?? null;
  base.updated_at_source = dates.updated_at_source ?? base.updated_at_source ?? null;
  return base;
}


// -------- Parsers --------

type Scraped = {
  source_url: string;
  external_id: string | null;
  title: string | null;
  price: number | null;
  rooms: number | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  house_number?: string | null;
  apartment_number?: string | null;
  sqm: number | null;
  floor: number | null;
  photos: string[];
  deal_type: DealType;
  owner_name: string | null;
  owner_phone: string | null;
  description: string | null;
  short_description?: string | null;
  long_description?: string | null;
  available_from?: string | null;
  attributes?: Record<string, unknown>;
  latitude?: number | null;
  longitude?: number | null;
  furniture_details?: Record<string, unknown>;
  additional_details?: Record<string, unknown>;
  price_history?: Array<{ date: string | null; price: number | null; label?: string }>;
  published_at?: string | null;
  updated_at_source?: string | null;
};

/**
 * Parses a Yad2 search-results HTML page. Yad2 ships several JSON payloads
 * (legacy `__NEXT_DATA__`, Next 13/14 RSC chunks in `self.__next_f.push`,
 * and inline `<script type="application/json">` blobs). We collect them all
 * and walk them for feed-item-shaped objects, then fall back to DOM cards.
 */
function parseSearch(html: string, srcUrl: string, limit: number): Scraped[] {
  const $ = cheerio.load(html);
  const dealType = detectDealType(srcUrl);
  const out: Scraped[] = [];
  const seen = new Set<string>();

  const jsonBlobs: any[] = [];
  const pushJson = (raw: string | null | undefined) => {
    if (!raw) return;
    try { jsonBlobs.push(JSON.parse(raw)); } catch { /* ignore */ }
  };

  // 1) Legacy __NEXT_DATA__
  pushJson($("#__NEXT_DATA__").html());

  // 2) Any <script type="application/json"> (some Next pages embed listings this way)
  $('script[type="application/json"]').each((_, el) => pushJson($(el).html()));

  // 3) Next 13/14 RSC flight chunks: self.__next_f.push([1,"...stringified..."])
  //    The second arg often contains stringified JSON with the search results.
  $("script").each((_, el) => {
    const s = $(el).html();
    if (!s || s.indexOf("__next_f") === -1) return;
    for (const m of s.matchAll(/__next_f\.push\(\[\s*\d+\s*,\s*("(?:\\.|[^"\\])*")\s*\]\)/g)) {
      try {
        const inner = JSON.parse(m[1]);              // -> raw string
        // Flight strings are typically "N:JSON..."; strip leading token prefix
        const colonIdx = inner.indexOf(":");
        const payload = colonIdx > -1 && colonIdx < 6 ? inner.slice(colonIdx + 1) : inner;
        pushJson(payload);
      } catch { /* ignore */ }
    }
  });

  const feed: any[] = [];
  const feedSeen = new Set<string>();
  const collect = (item: any) => {
    if (!item || typeof item !== "object") return;
    const key = String(item.token ?? item.orderId ?? item.order_id ?? item.adNumber ?? item.id ?? "");
    if (!key || feedSeen.has(key)) return;
    feedSeen.add(key);
    feed.push(item);
  };
  for (const blob of jsonBlobs) walkForFeedItems(blob, collect);

  for (const it of feed) {
    if (out.length >= limit) break;
    const token = it?.token ?? it?.orderId ?? it?.order_id ?? it?.adNumber ?? it?.id ?? null;
    let href: string | null = null;
    if (typeof token === "string" && /^[a-z0-9]{4,}$/i.test(token)) {
      href = `https://www.yad2.co.il/realestate/item/${token}`;
    } else if (typeof it?.url === "string") {
      href = it.url.startsWith("http") ? it.url : `https://www.yad2.co.il${it.url}`;
    } else if (typeof it?.link === "string") {
      href = it.link.startsWith("http") ? it.link : `https://www.yad2.co.il${it.link}`;
    }
    if (!href || seen.has(href)) continue;
    seen.add(href);

    const priceRaw = it?.price ?? it?.priceInShekels ?? it?.price_value ?? it?.metaData?.price ?? null;
    const roomsRaw = it?.rooms ?? it?.Rooms_text ?? it?.additionalDetails?.roomsCount ?? it?.row_3 ?? null;
    const sqmRaw = it?.square_meters ?? it?.SquareMeter ?? it?.additionalDetails?.squareMeter ?? null;
    const floorRaw = it?.floor ?? it?.additionalDetails?.floor ?? null;

    const city = clean(
      it?.city ?? it?.city_text ?? it?.address?.city?.text ?? it?.address?.city ?? it?.row_4 ?? null,
    );
    const neighborhood = clean(
      it?.neighborhood ?? it?.neighborhood_text ?? it?.address?.neighborhood?.text ?? it?.address?.neighborhood ?? null,
    );
    const address = clean(
      it?.street ?? it?.address?.street?.text ?? it?.address?.street ?? it?.row_2 ?? null,
    );

    let photos: string[] = [];
    const imgSrc = it?.images ?? it?.image ?? it?.metaData?.coverImage ?? null;
    if (Array.isArray(imgSrc)) {
      photos = imgSrc.map((im) => (typeof im === "string" ? im : im?.src ?? im?.url ?? "")).filter(Boolean);
    } else if (imgSrc && typeof imgSrc === "object") {
      photos = Object.values(imgSrc).map((v: any) => (typeof v === "string" ? v : v?.src ?? v?.url ?? "")).filter(Boolean);
    } else if (typeof imgSrc === "string") {
      photos = [imgSrc];
    }
    photos = photos.filter((u) => /^https?:\/\//.test(u) && !/placeholder|default|logo/i.test(u));

    out.push({
      source_url: href,
      external_id: typeof token === "string" ? token : null,
      title: clean(it?.title ?? it?.merchandise ?? it?.metaData?.title ?? it?.row_1 ?? [city, neighborhood].filter(Boolean).join(" · ")),
      price: toInt(priceRaw),
      rooms: toNum(roomsRaw),
      city,
      neighborhood,
      address,
      ...(() => {
        const n = pickAddressNumbers(it, address);
        const t = addressNumbersFromText(address, it?.row_2, it?.title, it?.merchandise);
        return {
          house_number: n.house_number ?? t.house_number,
          apartment_number: n.apartment_number ?? t.apartment_number,
        };
      })(),
      ...pickListingDates(it),
      sqm: toInt(sqmRaw),
      floor: toInt(floorRaw),
      photos,
      deal_type: dealType,
      owner_name: clean(it?.merchant_name ?? it?.customer?.name ?? null),
      owner_phone: null,
      description: clean(it?.description ?? null),
    });
  }
  if (out.length) return out;

  // DOM fallback — modern Yad2 uses feed-item cards
  const cardSel = [
    '[data-testid="feed-item"]',
    'article[class*="feed" i]',
    'div[class*="feeditem" i]',
    'a[href*="/realestate/item/"]',
  ].join(",");
  $(cardSel).each((_, el) => {
    if (out.length >= limit) return;
    const $el = $(el);
    const anchor = $el.is("a") ? $el : $el.find('a[href*="/realestate/item/"]').first();
    const rawHref = anchor.attr("href");
    if (!rawHref) return;
    const href = new URL(rawHref, "https://www.yad2.co.il").toString().split("?")[0];
    if (seen.has(href)) return;
    seen.add(href);
    const card = anchor.closest("article, li, [data-testid], div").first();
    const text = card.text();
    out.push({
      source_url: href,
      external_id: (href.match(/\/item\/([^/?#]+)/)?.[1]) ?? null,
      title: clean(card.find("h2,h3,[class*=title i]").first().text()) ?? clean(anchor.text()),
      price: toInt(text.match(/([\d,]{4,})\s*₪/)?.[1] ?? null),
      rooms: toNum(text.match(/(\d+(?:[.,]\d)?)\s*חדרים/)?.[1] ?? null),
      city: clean(card.find("[class*=city i], [data-testid*=city i]").first().text()),
      neighborhood: clean(card.find("[class*=neighborhood i]").first().text()),
      address: clean(card.find("[class*=address i], [class*=street i]").first().text()),
      sqm: toInt(text.match(/(\d{2,4})\s*מ["״]?ר/)?.[1] ?? null),
      floor: toInt(text.match(/קומה\s*(\d+)/)?.[1] ?? null),
      photos: card.find("img").toArray().map((i) => $(i).attr("src") || $(i).attr("data-src") || "").filter((u) => /^https?:\/\//.test(u) && !/logo|sprite|icon|placeholder/i.test(u)),
      deal_type: dealType,
      owner_name: null,
      owner_phone: null,
      description: null,
    });
  });

  return out;
}

/**
 * Depth-first walk that yields any object shaped like a Yad2 feed item.
 * Feed items expose an id-like key (token / orderId / adNumber / id) AND
 * at least one attribute we care about (price, rooms, address, ...).
 */
function walkForFeedItems(root: any, emit: (item: any) => void) {
  const stack: any[] = [root];
  const visited = new WeakSet<object>();
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (visited.has(node)) continue;
    visited.add(node);
    if (Array.isArray(node)) {
      for (const v of node) stack.push(v);
      continue;
    }
    const hasId = node.token != null || node.orderId != null || node.order_id != null || node.adNumber != null || (node.id != null && typeof node.id !== "object");
    const hasSignal =
      node.price != null || node.priceInShekels != null ||
      node.rooms != null || node.Rooms_text != null ||
      node.square_meters != null || node.SquareMeter != null ||
      node.merchandise != null || node.row_1 != null ||
      (node.address && typeof node.address === "object");
    if (hasId && hasSignal) emit(node);
    for (const k of Object.keys(node)) stack.push(node[k]);
  }
}

/**
 * Parses a single item HTML page.
 */
function parseItem(html: string, srcUrl: string): Scraped {
  const $ = cheerio.load(html);
  const dealType = detectDealType(srcUrl);
  const text = $("body").text();

  // Next.js JSON usually contains the full ad object under pageProps/RSC chunks.
  let ad: any = null;
  const jsonBlobs: any[] = [];
  const pushJson = (raw: string | null | undefined) => {
    if (!raw) return;
    try { jsonBlobs.push(JSON.parse(raw)); } catch { /* ignore */ }
  };
  const nextData = $("#__NEXT_DATA__").html();
  pushJson(nextData);
  $('script[type="application/json"]').each((_, el) => pushJson($(el).html()));
  $("script").each((_, el) => {
    const s = $(el).html();
    if (!s || s.indexOf("__next_f") === -1) return;
    for (const m of s.matchAll(/__next_f\.push\(\[\s*\d+\s*,\s*("(?:\\.|[^"\\])*")\s*\]\)/g)) {
      try {
        const inner = JSON.parse(m[1]);
        const colonIdx = inner.indexOf(":");
        const payload = colonIdx > -1 && colonIdx < 6 ? inner.slice(colonIdx + 1) : inner;
        pushJson(payload);
      } catch { /* ignore */ }
    }
  });
  if (nextData) {
    try {
      const j = JSON.parse(nextData);
      const props = j?.props?.pageProps;
      ad = props?.ad ?? props?.adDetails ?? props?.data ?? null;
      if (!ad) {
        // Walk one more layer looking for an object with a price + rooms
        (function walk(n: any) {
          if (ad || !n || typeof n !== "object") return;
          if (n && (n.price || n.priceInShekels) && (n.rooms || n.rooms_ts)) { ad = n; return; }
          for (const k of Object.keys(n)) walk(n[k]);
        })(j);
      }
    } catch { /* ignore */ }
  }
  if (!ad) {
    for (const blob of jsonBlobs) {
      (function walk(n: any, depth = 0) {
        if (ad || !n || typeof n !== "object" || depth > 8) return;
        if ((n.price || n.priceInShekels || n.metaData?.price) && (n.rooms || n.rooms_ts || n.additionalDetails || n.address)) {
          ad = n;
          return;
        }
        for (const k of Object.keys(n)) walk(n[k], depth + 1);
      })(blob);
      if (ad) break;
    }
  }

  const photos: string[] = pickAllPhotos(ad, ...jsonBlobs);
  if (!photos.length) {
    $("img").each((_, i) => {
      const u = normalizePhotoUrl($(i).attr("src") || $(i).attr("data-src") || $(i).attr("srcset") || "");
      if (u) photos.push(u);
    });
  }

  const idMatch = srcUrl.match(/\/item\/([^/?#]+)/);
  const priceText = clean($("[data-testid=price]").first().text()) ?? (text.match(/([\d,]{4,})\s*₪/)?.[1] ?? null);
  const roomsText = ad?.rooms ?? ad?.rooms_ts ?? text.match(/(\d+(?:[.,]\d)?)\s*חדרים/)?.[1];
  const sqmText = ad?.square_meters ?? text.match(/(\d{2,4})\s*מ["״]?ר/)?.[1];
  const floorText = ad?.floor ?? text.match(/קומה\s*(\d+)/)?.[1];

  const ownerName = clean(ad?.merchant_name ?? ad?.contact_name ?? ad?.customer?.name ?? null);
  const ownerPhone = clean(ad?.phone_number ?? ad?.merchant_phone ?? null);
  const coords = pickCoords(ad ?? {});

  // JSON first, then DOM/text fallbacks for the fields Yad2 only prints in HTML.
  const addressText = clean(ad?.street ?? ad?.address?.street?.text ?? null);
  const jsonNums = pickAddressNumbers(ad ?? {}, addressText ?? clean($("h1").first().text()));
  let houseNum = jsonNums.house_number;
  let aptNum = jsonNums.apartment_number;
  if (!houseNum || !aptNum) {
    for (const blob of jsonBlobs) {
      if (houseNum && aptNum) break;
      const n = pickAddressNumbers(blob, null);
      houseNum = houseNum ?? n.house_number;
      aptNum = aptNum ?? n.apartment_number;
    }
  }
  if (!houseNum || !aptNum) {
    const domNums = addressNumbersFromHtml($, text);
    houseNum = houseNum ?? domNums.house_number;
    aptNum = aptNum ?? domNums.apartment_number;
  }
  if (!houseNum || !aptNum) {
    const txtNums = addressNumbersFromText(addressText, clean($("h1").first().text()));
    houseNum = houseNum ?? txtNums.house_number;
    aptNum = aptNum ?? txtNums.apartment_number;
  }
  // "פורסם ב 18/07/26" — original publication date printed on the ad page.
  const jsonDates = pickListingDates(ad ?? {});
  const publishedAt = jsonDates.published_at
    ?? (() => { for (const b of jsonBlobs) { const d = pickListingDates(b).published_at; if (d) return d; } return null; })()
    ?? publishedFromText(text);

  const additional = pickAdditionalDetails(ad ?? {});
  const domMoney = financialsFromHtml($, text);
  for (const [k, v] of Object.entries(domMoney)) {
    if (additional[k] == null || additional[k] === "") additional[k] = v;
  }

  const about = clean(ad?.description ?? ad?.info_text ?? null)
    ?? deepDescription(ad)
    ?? (() => { for (const b of jsonBlobs) { const d = deepDescription(b); if (d) return d; } return null; })()
    ?? descriptionFromHtml($);

  return {
    source_url: srcUrl,
    external_id: idMatch?.[1] ?? null,
    title: clean(ad?.title ?? $("h1").first().text()),
    price: toInt(priceText),
    rooms: toNum(roomsText),
    city: clean(ad?.city ?? ad?.address?.city?.text ?? null),
    neighborhood: clean(ad?.neighborhood ?? ad?.address?.neighborhood?.text ?? null),
    address: addressText,
    house_number: houseNum,
    apartment_number: aptNum,
    sqm: toInt(sqmText),
    floor: toInt(floorText),
    photos: pickAllPhotos(photos).slice(0, 40),
    deal_type: dealType,
    owner_name: ownerName,
    owner_phone: ownerPhone,
    description: about,
    short_description: clean(ad?.info_text ?? ad?.subtitle ?? null),
    long_description: about,
    available_from: pickAvailableFrom(ad ?? {}),
    attributes: pickAttributes(ad ?? {}),
    latitude: coords.lat,
    longitude: coords.lng,
    furniture_details: pickFurniture(ad ?? {}),
    additional_details: additional,
    price_history: pickPriceHistory(ad ?? {}),
    published_at: publishedAt,
    updated_at_source: jsonDates.updated_at_source,
  };

}


// -------- Transport B: Bright Data Scraping Browser (WS / puppeteer) --------
//
// Used when the REST Web Unlocker zone is unavailable or misconfigured
// (x-brd-err-code=client_10090). We drive a real Chromium through Bright
// Data, land on the public Yad2 page to pick up Radware cookies, then issue
// the gw.yad2.co.il JSON calls FROM INSIDE that page. Same-origin XHR with
// genuine cookies is the highest-fidelity way to read the feed.

type BrowserHarvest = { html: string | null; feeds: Array<{ url: string; body: string }> };

async function scrapingBrowserHarvest(
  pageUrl: string,
  feedUrls: string[],
  needFeeds: (html: string) => boolean = () => true,
): Promise<BrowserHarvest> {
  if (!BD_WS) throw new Error("BRIGHTDATA_WS_ENDPOINT is not configured");
  let browser: any = null;
  try {
    console.log("[yad2-unlocker] scraping-browser: connecting…");
    browser = await puppeteer.connect({ browserWSEndpoint: BD_WS });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 2200 });
    // NOTE: Bright Data Scraping Browser forbids overriding accept-language
    // ("Overriding accept-language headers forbidden"). Locale comes from the
    // il-geolocated exit node instead.

    console.log(`[yad2-unlocker] scraping-browser: goto ${pageUrl}`);
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page
      .waitForSelector('a[href*="/item/"], [data-testid="feed-item"], article', { timeout: 40_000 })
      .catch(() => {});
    // Yad2 hydrates the feed after the first paint; wait for real item anchors
    // rather than the shell, otherwise the RSC payload we parse is still empty.
    await page
      .waitForFunction(
        () => document.querySelectorAll('a[href*="/item/"]').length > 0,
        { timeout: 25_000, polling: 500 },
      )
      .catch(() => {});

    const itemAnchors: number = await page
      .evaluate(() => document.querySelectorAll('a[href*="/item/"]').length)
      .catch(() => -1);
    const pageTitle: string = await page.title().catch(() => "");

    const html: string = await page.content().catch(() => "");
    console.log(
      `[yad2-unlocker] scraping-browser: html bytes=${html.length} item_anchors=${itemAnchors} title=${JSON.stringify(pageTitle)}`,
    );

    const feeds: Array<{ url: string; body: string }> = [];
    // The rendered HTML is the reliable source; the gw.* JSON endpoints are
    // Radware-guarded and usually answer with an error page. Only spend time
    // on them when the HTML yielded nothing parseable.
    const feedTargets = needFeeds(html) ? feedUrls : [];
    if (!feedTargets.length) {
      console.log("[yad2-unlocker] scraping-browser: HTML sufficient — skipping gw feed calls");
    }
    for (const f of feedTargets) {
      try {
        const body: string = await page.evaluate(async (u: string) => {
          const r = await fetch(u, {
            credentials: "include",
            headers: { Accept: "application/json, text/plain, */*" },
          });
          return await r.text();
        }, f);
        console.log(
          `[yad2-unlocker] scraping-browser: in-page fetch ${f} bytes=${body?.length ?? 0} preview=${JSON.stringify((body ?? "").slice(0, 200))}`,
        );
        if (bdTrace.length < 20) {
          bdTrace.push({
            url: `[browser] ${f}`,
            bd_status: 200,
            bytes: body?.length ?? 0,
            preview: (body ?? "").slice(0, 300),
            attempt: 1,
          });
        }
        if (body && body.trim()) feeds.push({ url: f, body });
      } catch (e) {
        const msg = String((e as Error)?.message ?? e).slice(0, 300);
        console.warn(`[yad2-unlocker] scraping-browser: in-page fetch failed ${f} — ${msg}`);
        if (bdTrace.length < 20) {
          bdTrace.push({ url: `[browser] ${f}`, bd_status: 0, bytes: 0, preview: msg, attempt: 1 });
        }
      }
    }
    await page.close().catch(() => {});
    if (html && bdTrace.length < 20) {
      bdTrace.push({
        url: `[browser] ${pageUrl}`,
        bd_status: 200,
        bytes: html.length,
        content_type: "text/html",
        preview: html.slice(0, 300),
        attempt: 1,
      });
    }
    return { html: html || null, feeds };
  } finally {
    try { await browser?.disconnect?.(); } catch { /* noop */ }
  }
}

/**
 * Field-level merge of an HTML-parsed row with the richer gw JSON row.
 * JSON wins on descriptive fields; photo arrays are unioned (order-preserving).
 */
function mergeScraped(base: Scraped, extra: Scraped | null | undefined): Scraped {
  if (!extra) return base;
  const merged: Scraped = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    if (v == null) continue;
    if (k === "photos") continue;
    if (typeof v === "string" && !v.trim()) continue;
    if (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length) continue;
    if (Array.isArray(v) && !v.length) continue;
    (merged as Record<string, unknown>)[k] = v;
  }
  const seen = new Set<string>();
  const photos: string[] = [];
  for (const u of [...(base.photos ?? []), ...(extra.photos ?? [])]) {
    const key = String(u).split("?")[0].toLowerCase();
    if (!u || seen.has(key)) continue;
    seen.add(key);
    photos.push(u);
  }
  merged.photos = photos;
  return merged;
}

// -------- Save helpers --------


async function upsertOwnerProfile(
  admin: any,
  workspaceOwnerId: string,
  name: string | null,
  phone: string | null,
): Promise<string | null> {
  if (!name && !phone) return null;
  const fullName = name || (phone ? `בעלים ${phone.slice(-4)}` : "בעלים");
  // Try match by phone first, then by lower(name)
  if (phone) {
    const { data: byPhone } = await admin
      .from("crm_profiles").select("id").eq("workspace_owner_id", workspaceOwnerId)
      .eq("phone", phone).maybeSingle();
    if (byPhone?.id) return byPhone.id;
  }
  const { data: byName } = await admin
    .from("crm_profiles").select("id").eq("workspace_owner_id", workspaceOwnerId)
    .ilike("full_name", fullName).maybeSingle();
  if (byName?.id) return byName.id;

  const { data: created } = await admin.from("crm_profiles").insert({
    workspace_owner_id: workspaceOwnerId,
    full_name: fullName,
    phone: phone || null,
    profile_type: "Owner",
    source: "yad2_import",
    enrichment_status: "pending",
  }).select("id").maybeSingle();
  return created?.id ?? null;
}

const MEDIA_BUCKET = "post-media-cache";

/**
 * Downloads every scraped photo and stores it permanently in the
 * `post-media-cache` bucket so cards never depend on Yad2's CDN.
 * Already-mirrored URLs are passed through untouched.
 */
async function mirrorPhotos(admin: any, keyPrefix: string, urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const url of urls.slice(0, 25)) {
    if (url.includes(`/storage/v1/object/public/${MEDIA_BUCKET}/`)) { out.push(url); continue; }
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0", referer: "https://www.yad2.co.il/" },
      });
      if (!res.ok) { out.push(url); continue; }
      const ct = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
      if (!ct.startsWith("image/")) { out.push(url); continue; }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength < 1024) { out.push(url); continue; }
      const ext = ct.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "") || "jpg";
      const nameKey = url.split("?")[0].split("/").pop()?.replace(/[^\w.-]+/g, "_").slice(-48) || "img";
      const path = `yad2/${keyPrefix}/${nameKey}.${ext}`;
      const { error } = await admin.storage.from(MEDIA_BUCKET)
        .upload(path, bytes, { contentType: ct, upsert: true });
      if (error) { out.push(url); continue; }
      const { data: pub } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
      out.push(pub?.publicUrl || url);
    } catch (e) {
      console.warn(`[yad2-unlocker] mirror failed ${url}: ${String((e as Error)?.message ?? e)}`);
      out.push(url);
    }
  }
  return Array.from(new Set(out));
}

async function saveListing(admin: any, workspaceOwnerId: string, row: Scraped) {
  const { data: existing } = await admin
    .from("listings").select("id, slug, media_photos, source_metadata").eq("source_url", row.source_url).maybeSingle();
  const ownerId = await upsertOwnerProfile(admin, workspaceOwnerId, row.owner_name, row.owner_phone);

  // Full gallery, never a single thumbnail: merge whatever we already stored
  // with the freshly scraped set and dedupe by URL (ignoring the CDN's
  // size/quality query string so the same photo isn't saved twice).
  const previousPhotos = Array.isArray((existing as any)?.media_photos)
    ? ((existing as any).media_photos as unknown[]).filter((u): u is string => typeof u === "string")
    : [];
  const scrapedPhotos: string[] = [];
  const seenPhotoKeys = new Set<string>();
  for (const url of [...(row.photos ?? []), ...previousPhotos]) {
    const u = String(url ?? "").trim();
    if (!u || !/^https?:\/\//i.test(u)) continue;
    if (/placeholder|default|no[-_]?image|logo|sprite/i.test(u)) continue;
    const key = u.split("?")[0].replace(/\/+$/, "").toLowerCase();
    if (seenPhotoKeys.has(key)) continue;
    seenPhotoKeys.add(key);
    scrapedPhotos.push(u);
  }
  // Permanently mirror into Supabase storage so galleries load instantly and
  // the image counters stay accurate even if Yad2 rotates its CDN links.
  const mergedPhotos = await mirrorPhotos(
    admin,
    String(row.external_id || row.source_url.split("/").pop() || "misc"),
    scrapedPhotos,
  );


  const payload: Record<string, unknown> = {
    user_id: workspaceOwnerId,
    property_title: row.title || "מודעה מיד-2",
    description: row.description || row.title || "",
    asking_price: row.price ?? 0,
    rooms: row.rooms,
    city: row.city,
    neighborhood: row.neighborhood,
    address: row.address,
    house_number: row.house_number ?? null,
    apartment_number: row.apartment_number ?? null,
    sqm: row.sqm,
    floor: row.floor,
    deal_type: row.deal_type,
    source: "yad2",
    source_url: row.source_url,
    external_id: row.external_id,
    media_photos: mergedPhotos.slice(0, 40),

    short_description: row.short_description ?? null,
    long_description: row.long_description ?? row.description ?? null,
    available_from: row.available_from ?? null,
    attributes: row.attributes ?? {},
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    furniture_details: row.furniture_details ?? {},
    additional_details: row.additional_details ?? {},
    price_history: row.price_history ?? [],
    owner_id: ownerId,
    source_metadata: {
      scraper: "yad2-unlocker",
      external_id: row.external_id,
      property_type: (row.attributes?.property_type ?? row.attributes?.propertyType ?? row.attributes?.subcategory ?? null),
      media_urls: mergedPhotos.slice(0, 40),
      cached_media_urls: mergedPhotos.slice(0, 40),
      media_photos_count: mergedPhotos.length,
      owner_name: row.owner_name,
      owner_phone: row.owner_phone,
      house_number: row.house_number ?? null,
      apartment_number: row.apartment_number ?? null,
      scraped_at: new Date().toISOString(),
      // Original "פורסם ב-" date from Yad2 (never the import date).
      published_at: row.published_at ?? null,
      updated_at_source: row.updated_at_source ?? null,
    },
  };
  if (existing?.id) {
    // Never overwrite previously-scraped rich metadata with an empty result:
    // feed rows carry less detail than item pages.
    const updatePayload: Record<string, unknown> = { ...payload };
    // Keep the first-known publication date; a later pass must never
    // overwrite "פורסם ב-" with today's import timestamp.
    const prevMeta = (existing as any)?.source_metadata && typeof (existing as any).source_metadata === "object"
      ? (existing as any).source_metadata as Record<string, unknown>
      : {};
    updatePayload.source_metadata = {
      ...(payload.source_metadata as Record<string, unknown>),
      published_at: row.published_at ?? prevMeta.published_at ?? null,
      updated_at_source: row.updated_at_source ?? prevMeta.updated_at_source ?? null,
    };
    if (updatePayload.latitude == null) delete updatePayload.latitude;
    if (updatePayload.longitude == null) delete updatePayload.longitude;
    // Keep previously resolved address numbers / description when this pass
    // (a feed row) carries less detail than the item page did.
    for (const k of ["house_number", "apartment_number", "short_description", "long_description"]) {
      if (updatePayload[k] == null || updatePayload[k] === "") delete updatePayload[k];
    }
    for (const k of ["furniture_details", "additional_details"]) {
      const v = updatePayload[k] as Record<string, unknown> | undefined;
      if (!v || Object.keys(v).length === 0) delete updatePayload[k];
    }
    if (!Array.isArray(updatePayload.price_history) || (updatePayload.price_history as unknown[]).length === 0) {
      delete updatePayload.price_history;
    }
    const { error: updErr } = await admin.from("listings").update(updatePayload).eq("id", existing.id);
    // Never swallow a write failure — a silently dropped row is exactly how
    // the Yad2 feed appeared to "work" while the cache stayed empty.
    if (updErr) throw new Error(`update_failed(${existing.id}): ${updErr.message}`);
    return { id: existing.id, updated: true };
  }
  const slug = `yad2-${row.external_id || crypto.randomUUID().slice(0, 8)}`;
  const { data: inserted, error: insErr } = await admin.from("listings")
    .insert({ ...payload, slug }).select("id").maybeSingle();
  if (insErr) throw new Error(`insert_failed(${row.source_url}): ${insErr.message}`);
  if (!inserted?.id) throw new Error(`insert_returned_no_row(${row.source_url})`);
  return { id: inserted.id, updated: false };
}

// -------- Handler --------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = auth.replace("Bearer ", "");
    const earlyBody = await req.json().catch(() => ({} as any));
    let userId: string | undefined;
    if (SERVICE_KEY && token === SERVICE_KEY) {
      // Internal call (scheduled background sync). The caller states which
      // workspace owner the scraped inventory belongs to.
      userId = String(earlyBody?.owner_id ?? "") || undefined;
    } else {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
      const { data: claims } = await userClient.auth.getClaims(token);
      userId = claims?.claims?.sub;
    }
    if (!userId) return json({ error: "Unauthorized" }, 401);


    bdTrace = [];
    // Hard wall-clock budget. The platform kills the request at 150s with an
    // IDLE_TIMEOUT 504, so we stop scraping well before that and return
    // whatever we already have.
    const startedAt = Date.now();
    const BUDGET_MS = 110_000;
    const timeLeft = () => BUDGET_MS - (Date.now() - startedAt);
    let timedOut = false;
    const body = earlyBody;
    // Memory guard: each Yad2 page is multi-MB of HTML and the regex parsers
    // hold several copies at once. Keeping the per-invocation working set small
    // is what prevents WORKER_RESOURCE_LIMIT (out-of-memory) kills.
    const limit = Math.min(60, Math.max(1, Number(body?.limit) || 30));
    const previewOnly = Boolean(body?.preview_only);


    // Accept several shapes:
    //   1) { url: "https://www.yad2.co.il/..." }          — direct URL
    //   2) { query: "דירה 4 חדרים בהרצליה" }             — free text
    //   3) { city, rooms, min_price, max_price, listing_type, neighborhood, q }
    //      — structured params from propertySearch. Preferred: we translate
    //      them into a valid Yad2 www URL so both the JSON gateway and the
    //      HTML fallback receive correct filters.
    const rawUrl: string = String(body?.url ?? "").trim();
    const freeText: string = String(body?.query ?? body?.q ?? "").trim();
    const dealTypeIn = String(body?.listing_type ?? body?.deal_type ?? "").toLowerCase();
    const dealSeg: "forsale" | "rent" = dealTypeIn === "rent" ? "rent" : "forsale";

    function buildYad2Url(): string {
      if (rawUrl && /^https?:\/\//i.test(rawUrl)) return rawUrl;
      const u = new URL(`https://www.yad2.co.il/realestate/${dealSeg}`);
      const cityRaw = clean(String(body?.city ?? ""));
      const cfg = cityRaw ? YAD2_CITY_CODES[cityRaw] : null;
      if (cfg) {
        u.searchParams.set("area", cfg.area);
        u.searchParams.set("city", cfg.city);
      } else if (cityRaw) {
        // Fall back to free-text city; Yad2 accepts a `text` param.
        u.searchParams.set("text", cityRaw);
      }
      const rooms = Number(body?.rooms);
      if (Number.isFinite(rooms) && rooms > 0) {
        u.searchParams.set("rooms", `${rooms}-${rooms}`);
      }
      const minP = Number(body?.min_price);
      const maxP = Number(body?.max_price);
      if (Number.isFinite(minP) || Number.isFinite(maxP)) {
        u.searchParams.set("price", `${Number.isFinite(minP) ? minP : 0}-${Number.isFinite(maxP) ? maxP : ""}`);
      }
      // Free-text keywords (neighborhood, property type) go into the
      // catch-all `text` param. Yad2's server-side matcher is lenient
      // enough to accept these alongside structured filters.
      const kwParts: string[] = [];
      const hood = clean(String(body?.neighborhood ?? ""));
      if (hood) kwParts.push(hood);
      if (freeText) kwParts.push(freeText);
      if (kwParts.length && !u.searchParams.get("text")) {
        u.searchParams.set("text", kwParts.join(" "));
      }
      return u.toString();
    }

    const inputUrl = buildYad2Url();
    if (!rawUrl && !freeText && !body?.city && !body?.rooms) {
      return json({ error: "url is required" }, 400);
    }
    console.log(`[yad2-unlocker] resolved URL -> ${inputUrl}`);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const isItemUrl = /\/realestate\/item\//.test(inputUrl);


    let rows: Scraped[] = [];
    let mode: "json" | "html" | "browser" = "json";
    let jsonSource: string | null = null;
    // Per-endpoint diagnostics so callers (and Supabase logs) can see
    // exactly which direct-Yad2 hop returned data vs. was blocked.
    const diagnostics: Array<{ endpoint: string; kind: "json" | "html" | "item"; status: "ok" | "empty" | "error"; count?: number; error?: string }> = [];

    // One full three-tier scrape of a single Yad2 results page.
    async function scrapeOnce(pageUrl: string): Promise<Scraped[]> {
      let out: Scraped[] = [];

      // --- Primary path: Yad2 internal JSON gateway (direct, no aggregator) ---
      try {
        if (isItemUrl) {
          const gwItem = toGatewayItemUrl(pageUrl);
          if (gwItem) {
            console.log(`[yad2-unlocker] JSON item ${gwItem}`);
            try {
              const raw = await unlock(gwItem, { accept: "application/json" });
              const row = parseItemJson(raw, pageUrl);
              if (row) { out = [row]; jsonSource = gwItem; diagnostics.push({ endpoint: gwItem, kind: "item", status: "ok", count: 1 }); }
              else diagnostics.push({ endpoint: gwItem, kind: "item", status: "empty" });
            } catch (e: any) {
              diagnostics.push({ endpoint: gwItem, kind: "item", status: "error", error: String(e?.message ?? e).slice(0, 400) });
            }
          }
        } else {
          const candidates = toGatewayFeedUrls(pageUrl);
          for (const gw of candidates) {
            try {
              console.log(`[yad2-unlocker] JSON search ${gw}`);
              const raw = await unlock(gw, { accept: "application/json", maxAttempts: 2 });
              const parsed = parseSearchJson(raw, pageUrl, limit);
              if (parsed.length) {
                out = parsed; jsonSource = gw; mode = "json";
                diagnostics.push({ endpoint: gw, kind: "json", status: "ok", count: parsed.length });
                break;
              }
              console.warn(`[yad2-unlocker] JSON endpoint returned 0 items: ${gw}`);
              diagnostics.push({ endpoint: gw, kind: "json", status: "empty" });
            } catch (e: any) {
              const err = String(e?.message ?? e).slice(0, 400);
              console.warn(`[yad2-unlocker] JSON endpoint failed: ${gw} — ${err}`);
              diagnostics.push({ endpoint: gw, kind: "json", status: "error", error: err });
            }
          }
        }
      } catch (e: any) {
        console.warn(`[yad2-unlocker] JSON gateway threw: ${String(e?.message ?? e).slice(0, 200)}`);
      }

      // --- Fallback B: HTML scrape of the public www URL via the REST unlocker -
      if (!out.length) {
        mode = "html";
        console.log(`[yad2-unlocker] falling back to HTML: ${pageUrl}`);
        try {
          const html = await unlock(pageUrl, { maxAttempts: 2 });
          out = isItemUrl ? [parseItem(html, pageUrl)] : parseSearch(html, pageUrl, limit);
          diagnostics.push({ endpoint: pageUrl, kind: "html", status: out.length ? "ok" : "empty", count: out.length });
        } catch (e: any) {
          const err = String(e?.message ?? e).slice(0, 400);
          console.warn(`[yad2-unlocker] HTML unlocker failed: ${err}`);
          diagnostics.push({ endpoint: pageUrl, kind: "html", status: "error", error: err });
        }
      }

      // --- Fallback C: Bright Data Scraping Browser (real Chromium over WS) ----
      if (!out.length && BD_WS) {
        mode = "browser";
        try {
          const feedUrls = isItemUrl
            ? [toGatewayItemUrl(pageUrl)].filter(Boolean) as string[]
            : toGatewayFeedUrls(pageUrl);
          // For a single item we ALWAYS want the gw JSON: it is the only source
          // of `על הנכס` / `פרטים נוספים` / coordinates / price history. The HTML
          // alone yields a thin row (title = neighbourhood, no description).
          const harvest = await scrapingBrowserHarvest(pageUrl, feedUrls, (html) => {
            if (isItemUrl) return true;
            try {
              const probe = parseSearch(html, pageUrl, limit);
              console.log(`[yad2-unlocker] scraping-browser: HTML parse yielded ${probe.length} row(s)`);
              return probe.length === 0;
            } catch (e) {
              console.warn(`[yad2-unlocker] scraping-browser: HTML parse threw ${String((e as Error)?.message ?? e)}`);
              return true;
            }
          });

          if (harvest.html) {
            const parsed = isItemUrl
              ? ([parseItem(harvest.html, pageUrl)].filter(Boolean) as Scraped[])
              : parseSearch(harvest.html, pageUrl, limit);
            // Release the multi-MB document as soon as it is parsed.
            harvest.html = null;
            if (parsed.length) {
              out = parsed;
              diagnostics.push({ endpoint: `[browser] ${pageUrl}`, kind: "html", status: "ok", count: parsed.length });
            }
          }

          // Merge (item) or fall back (search) using the harvested JSON feeds.
          while (harvest.feeds.length) {
            const f = harvest.feeds.shift()!;
            const parsed = isItemUrl
              ? ([parseItemJson(f.body, pageUrl)].filter(Boolean) as Scraped[])
              : parseSearchJson(f.body, pageUrl, limit);
            if (!parsed.length) {
              diagnostics.push({ endpoint: `[browser] ${f.url}`, kind: "json", status: "empty" });
              continue;
            }
            if (isItemUrl && out.length) {
              out = [mergeScraped(out[0], parsed[0])];
              jsonSource = f.url;
              diagnostics.push({ endpoint: `[browser] ${f.url}`, kind: "json", status: "ok", count: 1 });
              break;
            }
            if (!out.length) {
              out = parsed;
              jsonSource = f.url;
              diagnostics.push({ endpoint: `[browser] ${f.url}`, kind: "json", status: "ok", count: parsed.length });
              break;
            }
          }

          if (!out.length) {
            diagnostics.push({ endpoint: `[browser] ${pageUrl}`, kind: "html", status: "empty", count: 0 });
          }

        } catch (e: any) {
          const err = String(e?.message ?? e).slice(0, 400);
          console.warn(`[yad2-unlocker] scraping-browser failed: ${err}`);
          diagnostics.push({ endpoint: "[browser]", kind: "html", status: "error", error: err });
        }
      }

      return out;
    }

    // Pagination — Yad2 serves ~30-40 items per page. Walk pages until the
    // requested `limit` is met, a page comes back empty, or `pages` is hit.
    const startPage = Math.max(1, Number(body?.page) || 1);
    const maxPages = isItemUrl || previewOnly
      ? 1
      : Math.min(2, Math.max(1, Number(body?.pages) || Math.ceil(limit / 30)));
    const seenKeys = new Set<string>();
    let pagesScanned = 0;

    for (let p = startPage; p < startPage + maxPages; p++) {
      // Leave room for enrichment + saving.
      if (timeLeft() < 35_000) { timedOut = true; break; }
      let pageUrl = inputUrl;

      if (!isItemUrl && p > 1) {
        const u = new URL(inputUrl);
        u.searchParams.set("page", String(p));
        pageUrl = u.toString();
      }
      pagesScanned++;
      const pageRows = await scrapeOnce(pageUrl);
      if (!pageRows.length) break;
      let added = 0;
      for (const r of pageRows) {
        const key = String(r.external_id || r.source_url || "");
        if (!key || seenKeys.has(key)) continue;
        seenKeys.add(key);
        rows.push(r);
        added++;
      }
      // A page that adds nothing new means Yad2 is repeating the first page.
      if (added === 0) break;
      if (rows.length >= limit) break;
    }
    rows = rows.slice(0, limit);


    // Nothing worked at all — surface the real cause. These are soft failures
    // (HTTP 200 with results: []) so the Properties page can keep rendering the
    // other sources instead of throwing a FunctionsHttpError.
    if (!rows.length) {
      const hardErrors = diagnostics.filter((d) => d.status === "error");
      const allErrText = hardErrors.map((d) => d.error ?? "").join(" | ");
      // Bright Data account-level failure (suspended / unpaid billing).
      if (/client_10020|Account is suspended|billing/i.test(allErrText)) {
        return json({
          source: "yad2",
          connected: false,
          error: "brightdata_account_suspended",
          detail:
            "חשבון Bright Data מושהה — יש להסדיר את החיוב בלוח הבקרה של Bright Data כדי לחדש את שאיבת הנתונים מיד2. שאר מקורות החיפוש ממשיכים לפעול.",
          results: [],
          diagnostics,
          bd_trace: bdTrace,
          resolved_url: inputUrl,
        });
      }
      const zoneFault = hardErrors.find((d) => /brightdata_zone_mode|client_10090/i.test(d.error ?? ""));
      if (zoneFault) {
        return json({
          source: "yad2",
          connected: false,
          error: "brightdata_zone_misconfigured",
          detail:
            'The Bright Data zone "' + BD_ZONE +
            '" is a Scraping Browser zone, but the REST Web Unlocker API was called against it. ' +
            "Create a Web Unlocker zone and set BRIGHTDATA_ZONE to its name, or ensure BRIGHTDATA_WS_ENDPOINT is valid so the browser transport can be used.",
          results: [],
          diagnostics,
          bd_trace: bdTrace,
          resolved_url: inputUrl,
        });
      }
      if (hardErrors.length) {
        return json({
          source: "yad2",
          connected: false,
          error: "yad2_fetch_failed",
          detail: hardErrors.map((d) => `${d.endpoint}: ${d.error}`).join(" | ").slice(0, 1200),
          results: [],
          diagnostics,
          bd_trace: bdTrace,
          resolved_url: inputUrl,
        });
      }
    }


    // Yad2 interleaves sponsored "projects" from unrelated cities into every
    // feed. When the caller asked for a specific city, drop rows that clearly
    // belong somewhere else so the cache stays trustworthy. Rows with an
    // unknown city are kept — we only discard positive mismatches.
    const requestedCity = clean(String(body?.city ?? ""));
    if (requestedCity && !isItemUrl) {
      const before = rows.length;
      const norm = (v: string) => v.replace(/["'׳״]/g, "").replace(/\s+/g, " ").trim();
      const want = norm(requestedCity);
      rows = rows.filter((r) => {
        if (!r.city) return true;
        const got = norm(r.city);
        return got === want || got.includes(want) || want.includes(got);
      });
      if (rows.length !== before) {
        console.log(
          `[yad2-unlocker] city filter "${requestedCity}": dropped ${before - rows.length} off-city sponsored row(s)`,
        );
      }
    }

    console.log(`[yad2-unlocker] parsed ${rows.length} row(s) via ${mode}`);

    // --- Gallery enrichment: feed rows only carry the cover thumbnail. Pull
    // the full image array from the item endpoint for rows that look thin.
    if (!previewOnly) {
      const thin = rows.filter((r) => (r.photos?.length ?? 0) < 3 && r.external_id).slice(0, 8);
      const enrichOne = async (r: typeof thin[number]) => {
        const gwItem = `https://gw.yad2.co.il/realestate-feed/item/${r.external_id}`;
        try {
          const raw = await unlock(gwItem, { accept: "application/json", maxAttempts: 1 });
          const full = parseItemJson(raw, r.source_url);
          if (full) {
            r.photos = pickAllPhotos(full.photos, r.photos);
            r.long_description = full.long_description ?? r.long_description ?? null;
            r.description = r.description || full.description || null;
            r.furniture_details = { ...(r.furniture_details ?? {}), ...(full.furniture_details ?? {}) };
            r.additional_details = { ...(r.additional_details ?? {}), ...(full.additional_details ?? {}) };
            r.attributes = { ...(r.attributes ?? {}), ...(full.attributes ?? {}) };
            if (full.price_history?.length) r.price_history = full.price_history;
            r.latitude = r.latitude ?? full.latitude ?? null;
            r.longitude = r.longitude ?? full.longitude ?? null;
          }
        } catch (e) {
          console.warn(`[yad2-unlocker] gallery enrich failed ${gwItem}: ${String((e as Error)?.message ?? e)}`);
        }
      };
      // Run in small parallel batches, and bail out once the budget is thin so
      // the save step still gets to run before the platform's 150s cut-off.
      for (let i = 0; i < thin.length; i += 2) {
        if (timeLeft() < 25_000) { timedOut = true; break; }
        await Promise.all(thin.slice(i, i + 2).map(enrichOne));
      }
    }

    let saved = 0;
    const saveErrors: any[] = [];
    if (!previewOnly) {
      const saveOne = async (r: typeof rows[number]) => {
        try {
          await saveListing(admin, userId, r);
          saved++;
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          console.error(`[yad2-unlocker] save failed ${r.source_url}: ${msg}`);
          saveErrors.push({ url: r.source_url, error: msg });
        }
      };
      for (let i = 0; i < rows.length; i += 3) {
        if (timeLeft() < 5_000) { timedOut = true; break; }
        await Promise.all(rows.slice(i, i + 3).map(saveOne));
      }
      console.log(`[yad2-unlocker] saved ${saved}/${rows.length} row(s), ${saveErrors.length} error(s)`);
    } else {
      console.log(`[yad2-unlocker] preview_only=true — skipping DB save for ${rows.length} row(s)`);
    }


    return json({
      success: true,
      partial: timedOut,
      elapsed_ms: Date.now() - startedAt,

      urls_scanned: pagesScanned,
      pages_scanned: pagesScanned,

      records_scraped: rows.length,
      records_saved: saved,
      results: rows,
      save_errors: saveErrors,
      mode: isItemUrl ? "item" : "search",
      transport: mode,
      json_source: jsonSource,
      diagnostics,
      bd_trace: bdTrace,
      resolved_url: inputUrl,
    });
  } catch (e: any) {
    console.error("[yad2-unlocker] error", e);
    return json({ source: "yad2", connected: false, error: "scrape_failed", results: [], detail: String(e?.message ?? e), bd_trace: bdTrace });
  }
});

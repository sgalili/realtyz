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

function pickPhotos(raw: any): string[] {
  const out: string[] = [];
  const push = (v: any) => {
    const u = typeof v === "string" ? v : v?.src ?? v?.url ?? v?.image_url ?? "";
    if (typeof u === "string" && /^https?:\/\//.test(u) && !/placeholder|default|logo|sprite/i.test(u)) out.push(u);
  };
  if (Array.isArray(raw)) raw.forEach(push);
  else if (raw && typeof raw === "object") Object.values(raw).forEach(push);
  else if (raw) push(raw);
  return Array.from(new Set(out));
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
  );

  const shortDesc = clean(it?.info_text ?? it?.subtitle ?? it?.metaData?.description ?? null);
  const longDesc = clean(it?.description ?? it?.metaData?.longDescription ?? it?.freeText ?? null);

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
  base.long_description = clean(ad?.description ?? ad?.info_text ?? base.long_description);
  base.short_description = clean(ad?.info_text ?? ad?.subtitle ?? base.short_description);
  base.available_from = pickAvailableFrom(ad) ?? base.available_from ?? null;
  base.attributes = { ...(base.attributes ?? {}), ...pickAttributes(ad) };
  base.photos = pickAllPhotos(base.photos, ad?.images, ad?.metaData?.images, ad?.gallery);
  base.description = base.long_description ?? base.short_description ?? base.description;
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

  // Next.js JSON usually contains the full ad object under pageProps
  let ad: any = null;
  const nextData = $("#__NEXT_DATA__").html();
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

  const photos: string[] = [];
  if (ad?.images) {
    const arr = Array.isArray(ad.images) ? ad.images : Object.values(ad.images);
    for (const im of arr) {
      const u = typeof im === "string" ? im : (im?.src ?? im?.url ?? im?.image_url);
      if (u && /^https?:\/\//.test(u) && !/placeholder|default/i.test(u)) photos.push(u);
    }
  }
  if (!photos.length) {
    $("img").each((_, i) => {
      const u = $(i).attr("src") || $(i).attr("data-src") || "";
      if (/^https?:\/\/img\.yad2\.co\.il|images\.yad2/.test(u) && !/placeholder|default|logo/i.test(u)) photos.push(u);
    });
  }

  const idMatch = srcUrl.match(/\/item\/([^/?#]+)/);
  const priceText = clean($("[data-testid=price]").first().text()) ?? (text.match(/([\d,]{4,})\s*₪/)?.[1] ?? null);
  const roomsText = ad?.rooms ?? ad?.rooms_ts ?? text.match(/(\d+(?:[.,]\d)?)\s*חדרים/)?.[1];
  const sqmText = ad?.square_meters ?? text.match(/(\d{2,4})\s*מ["״]?ר/)?.[1];
  const floorText = ad?.floor ?? text.match(/קומה\s*(\d+)/)?.[1];

  const ownerName = clean(ad?.merchant_name ?? ad?.contact_name ?? ad?.customer?.name ?? null);
  const ownerPhone = clean(ad?.phone_number ?? ad?.merchant_phone ?? null);

  return {
    source_url: srcUrl,
    external_id: idMatch?.[1] ?? null,
    title: clean(ad?.title ?? $("h1").first().text()),
    price: toInt(priceText),
    rooms: toNum(roomsText),
    city: clean(ad?.city ?? ad?.address?.city?.text ?? null),
    neighborhood: clean(ad?.neighborhood ?? ad?.address?.neighborhood?.text ?? null),
    address: clean(ad?.street ?? ad?.address?.street?.text ?? null),
    sqm: toInt(sqmText),
    floor: toInt(floorText),
    photos: Array.from(new Set(photos)).slice(0, 40),
    deal_type: dealType,
    owner_name: ownerName,
    owner_phone: ownerPhone,
    description: clean(ad?.description ?? null),
    short_description: clean(ad?.info_text ?? ad?.subtitle ?? null),
    long_description: clean(ad?.description ?? null),
    available_from: pickAvailableFrom(ad ?? {}),
    attributes: pickAttributes(ad ?? {}),
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
  // When a shared session is supplied the browser is reused across paginated
  // requests (one Bright Data connect costs ~10-20s, so re-connecting per page
  // was the single biggest reason deep searches timed out client-side).
  session?: { browser: any | null },
): Promise<BrowserHarvest> {
  if (!BD_WS) throw new Error("BRIGHTDATA_WS_ENDPOINT is not configured");
  let browser: any = session?.browser ?? null;
  try {
    if (!browser) {
      console.log("[yad2-unlocker] scraping-browser: connecting…");
      browser = await puppeteer.connect({ browserWSEndpoint: BD_WS });
      if (session) session.browser = browser;
    } else {
      console.log("[yad2-unlocker] scraping-browser: reusing session");
    }
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
    // Only tear the connection down when we own it. Shared sessions are closed
    // by the caller after the last page.
    if (!session) {
      try { await browser?.disconnect?.(); } catch { /* noop */ }
    }
  }
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

async function saveListing(admin: any, workspaceOwnerId: string, row: Scraped) {
  const { data: existing } = await admin
    .from("listings").select("id, slug, media_photos").eq("source_url", row.source_url).maybeSingle();
  const ownerId = await upsertOwnerProfile(admin, workspaceOwnerId, row.owner_name, row.owner_phone);

  // Full gallery, never a single thumbnail: merge whatever we already stored
  // with the freshly scraped set and dedupe by URL (ignoring the CDN's
  // size/quality query string so the same photo isn't saved twice).
  const previousPhotos = Array.isArray((existing as any)?.media_photos)
    ? ((existing as any).media_photos as unknown[]).filter((u): u is string => typeof u === "string")
    : [];
  const mergedPhotos: string[] = [];
  const seenPhotoKeys = new Set<string>();
  for (const url of [...(row.photos ?? []), ...previousPhotos]) {
    const u = String(url ?? "").trim();
    if (!u || !/^https?:\/\//i.test(u)) continue;
    if (/placeholder|default|no[-_]?image|logo|sprite/i.test(u)) continue;
    const key = u.split("?")[0].replace(/\/+$/, "").toLowerCase();
    if (seenPhotoKeys.has(key)) continue;
    seenPhotoKeys.add(key);
    mergedPhotos.push(u);
  }

  const payload: Record<string, unknown> = {
    user_id: workspaceOwnerId,
    property_title: row.title || "מודעה מיד-2",
    description: row.description || row.title || "",
    asking_price: row.price ?? 0,
    rooms: row.rooms,
    city: row.city,
    neighborhood: row.neighborhood,
    address: row.address,
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
    owner_id: ownerId,
    source_metadata: {
      scraper: "yad2-unlocker",
      external_id: row.external_id,
      owner_name: row.owner_name,
      owner_phone: row.owner_phone,
      scraped_at: new Date().toISOString(),
    },
  };
  if (existing?.id) {
    const { error: updErr } = await admin.from("listings").update(payload).eq("id", existing.id);
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
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const token = auth.replace("Bearer ", "");
    const { data: claims } = await userClient.auth.getClaims(token);
    const userId = claims?.claims?.sub;
    if (!userId) return json({ error: "Unauthorized" }, 401);

    bdTrace = [];
    const body = await req.json().catch(() => ({} as any));
    const limit = Math.min(300, Math.max(1, Number(body?.limit) || 30));
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

    // Shared Scraping Browser session reused by every paginated page.
    const browserSession: { browser: any | null } = { browser: null };

    // One full three-tier scrape of a single Yad2 results page.
    async function scrapeOnce(pageUrl: string): Promise<Scraped[]> {
      let out: Scraped[] = [];
      // Once the REST Web Unlocker zone has been proven unusable (client_10090)
      // and a Scraping Browser endpoint exists, stop paying for the doomed
      // REST tiers on every subsequent page — go straight to the browser.
      const browserFirst = Boolean(BD_WS && bdZoneBroken);
      if (browserFirst) {
        console.log("[yad2-unlocker] REST zone known-bad — browser-first transport");
      }

      // --- Primary path: Yad2 internal JSON gateway (direct, no aggregator) ---
      if (!browserFirst) try {

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
      if (!out.length && !browserFirst) {

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
          const harvest = await scrapingBrowserHarvest(pageUrl, feedUrls, (html) => {

            try {
              const probe = isItemUrl
                ? ([parseItem(html, pageUrl)].filter(Boolean) as Scraped[])
                : parseSearch(html, pageUrl, limit);
              console.log(`[yad2-unlocker] scraping-browser: HTML parse yielded ${probe.length} row(s)`);
              return probe.length === 0;
            } catch (e) {
              console.warn(`[yad2-unlocker] scraping-browser: HTML parse threw ${String((e as Error)?.message ?? e)}`);
              return true;
            }
          }, browserSession);


          if (harvest.html) {
            const parsed = isItemUrl
              ? ([parseItem(harvest.html, pageUrl)].filter(Boolean) as Scraped[])
              : parseSearch(harvest.html, pageUrl, limit);
            if (parsed.length) {
              out = parsed;
              diagnostics.push({ endpoint: `[browser] ${pageUrl}`, kind: "html", status: "ok", count: parsed.length });
            }
          }

          for (const f of out.length ? [] : harvest.feeds) {
            const parsed = isItemUrl
              ? ([parseItemJson(f.body, pageUrl)].filter(Boolean) as Scraped[])
              : parseSearchJson(f.body, pageUrl, limit);
            if (parsed.length) {
              out = parsed;
              jsonSource = f.url;
              diagnostics.push({ endpoint: `[browser] ${f.url}`, kind: "json", status: "ok", count: parsed.length });
              break;
            }
            diagnostics.push({ endpoint: `[browser] ${f.url}`, kind: "json", status: "empty" });
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
      : Math.min(10, Math.max(1, Number(body?.pages) || Math.ceil(limit / 30)));
    const seenKeys = new Set<string>();
    let pagesScanned = 0;

    for (let p = startPage; p < startPage + maxPages; p++) {
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


    // Nothing worked at all — surface the real cause instead of "0 results".
    if (!rows.length) {
      const hardErrors = diagnostics.filter((d) => d.status === "error");
      const zoneFault = hardErrors.find((d) => /brightdata_zone_mode|client_10090/i.test(d.error ?? ""));
      if (zoneFault) {
        return json({
          error: "brightdata_zone_misconfigured",
          detail:
            'The Bright Data zone "' + BD_ZONE +
            '" is a Scraping Browser zone, but the REST Web Unlocker API was called against it. ' +
            "Create a Web Unlocker zone and set BRIGHTDATA_ZONE to its name, or ensure BRIGHTDATA_WS_ENDPOINT is valid so the browser transport can be used.",
          diagnostics,
          bd_trace: bdTrace,
          resolved_url: inputUrl,
        }, 502);
      }
      if (hardErrors.length) {
        return json({
          error: "yad2_fetch_failed",
          detail: hardErrors.map((d) => `${d.endpoint}: ${d.error}`).join(" | ").slice(0, 1200),
          diagnostics,
          bd_trace: bdTrace,
          resolved_url: inputUrl,
        }, 502);
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

    let saved = 0;
    const saveErrors: any[] = [];
    if (!previewOnly) {
      for (const r of rows) {
        try {
          await saveListing(admin, userId, r);
          saved++;
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          console.error(`[yad2-unlocker] save failed ${r.source_url}: ${msg}`);
          saveErrors.push({ url: r.source_url, error: msg });
        }
      }
      console.log(`[yad2-unlocker] saved ${saved}/${rows.length} row(s), ${saveErrors.length} error(s)`);
    } else {
      console.log(`[yad2-unlocker] preview_only=true — skipping DB save for ${rows.length} row(s)`);
    }

    return json({
      success: true,
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
    return json({ error: "scrape_failed", detail: String(e?.message ?? e), bd_trace: bdTrace }, 502);
  }
});

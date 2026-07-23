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
import https from "node:https";
import { Buffer } from "node:buffer";

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

function brightDataRequest(
  url: string,
  opts: { accept?: string } = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    // Forward realistic browser headers to the target (Yad2). Without a
    // real User-Agent + Referer + Accept-Language the gw.yad2.co.il JSON
    // gateway returns an empty body / 403 even through Bright Data's
    // unlocker. Bright Data's /request API forwards any `headers` array
    // entries to the upstream site verbatim.
    const forwardedAccept = opts.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8";
    const payload = JSON.stringify({
      zone: BD_ZONE,
      url,
      format: "raw",
      country: "il",
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": forwardedAccept,
        "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://www.yad2.co.il/",
        "Origin": "https://www.yad2.co.il",
        "sec-ch-ua": '"Chromium";v="126", "Not.A/Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
      },
    });
    const req = https.request(
      {
        hostname: "api.brightdata.com",
        port: 443,
        path: "/request",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${BD_TOKEN}`,
          Accept: opts.accept ?? "text/html,application/xhtml+xml,*/*",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode ?? 0, body });
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}


async function unlock(
  url: string,
  opts: { accept?: string; maxAttempts?: number } = {},
): Promise<string> {
  if (!BD_TOKEN) throw new Error("BRIGHTDATA_API_TOKEN is not configured");
  const maxAttempts = opts.maxAttempts ?? 4;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { status, body } = await brightDataRequest(url, { accept: opts.accept });
      // Explicit direct-fetch diagnostics — surface Bright Data / Yad2 status
      // and a preview of the upstream body so proxy blocks, CAPTCHAs, and
      // empty gateway payloads are visible in Supabase logs.
      console.log(
        `[yad2-unlocker] direct-fetch ${url} → BD status=${status} bytes=${body.length} preview=${JSON.stringify(body.slice(0, 220))}`,
      );
      if (status >= 200 && status < 300) return body;
      if ((status >= 500 || status === 429 || status === 403) && attempt < maxAttempts) {
        console.warn(`[yad2-unlocker] BD ${status} attempt ${attempt} for ${url}, retrying`);
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      throw new Error(`Bright Data ${status} for ${url}: ${body.slice(0, 400)}`);
    } catch (e) {
      lastErr = e;
      const msg = String((e as Error)?.message ?? e);
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

  const photos = pickPhotos(it?.metaData?.images ?? it?.images ?? it?.image ?? it?.metaData?.coverImage);

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
    description: clean(it?.description ?? null),
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
  try { payload = JSON.parse(body); } catch { return []; }
  const items = extractFeedItems(payload);
  const out: Scraped[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (out.length >= limit) break;
    const row = feedItemToScraped(it, dealType);
    if (!row || seen.has(row.source_url)) continue;
    seen.add(row.source_url);
    out.push(row);
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
  base.description = clean(ad?.description ?? ad?.info_text ?? base.description);
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
    photos: photos.slice(0, 25),
    deal_type: dealType,
    owner_name: ownerName,
    owner_phone: ownerPhone,
    description: clean(ad?.description ?? null),
  };
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
    .from("listings").select("id, slug").eq("source_url", row.source_url).maybeSingle();
  const ownerId = await upsertOwnerProfile(admin, workspaceOwnerId, row.owner_name, row.owner_phone);

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
    media_photos: row.photos,
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
    await admin.from("listings").update(payload).eq("id", existing.id);
    return { id: existing.id, updated: true };
  }
  const slug = `yad2-${row.external_id || crypto.randomUUID().slice(0, 8)}`;
  const { data: inserted } = await admin.from("listings")
    .insert({ ...payload, slug }).select("id").maybeSingle();
  return { id: inserted?.id, updated: false };
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

    const body = await req.json().catch(() => ({} as any));
    const limit = Math.min(80, Math.max(1, Number(body?.limit) || 30));
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
    let mode: "json" | "html" = "json";
    let jsonSource: string | null = null;
    // Per-endpoint diagnostics so callers (and Supabase logs) can see
    // exactly which direct-Yad2 hop returned data vs. was blocked.
    const diagnostics: Array<{ endpoint: string; kind: "json" | "html" | "item"; status: "ok" | "empty" | "error"; count?: number; error?: string }> = [];

    // --- Primary path: Yad2 internal JSON gateway (direct, no aggregator) ---
    try {
      if (isItemUrl) {
        const gwItem = toGatewayItemUrl(inputUrl);
        if (gwItem) {
          console.log(`[yad2-unlocker] JSON item ${gwItem}`);
          try {
            const body = await unlock(gwItem, { accept: "application/json" });
            const row = parseItemJson(body, inputUrl);
            if (row) { rows = [row]; jsonSource = gwItem; diagnostics.push({ endpoint: gwItem, kind: "item", status: "ok", count: 1 }); }
            else diagnostics.push({ endpoint: gwItem, kind: "item", status: "empty" });
          } catch (e: any) {
            diagnostics.push({ endpoint: gwItem, kind: "item", status: "error", error: String(e?.message ?? e).slice(0, 400) });
          }
        }
      } else {
        const candidates = toGatewayFeedUrls(inputUrl);
        for (const gw of candidates) {
          try {
            console.log(`[yad2-unlocker] JSON search ${gw}`);
            const body = await unlock(gw, { accept: "application/json", maxAttempts: 2 });
            const parsed = parseSearchJson(body, inputUrl, limit);
            if (parsed.length) {
              rows = parsed; jsonSource = gw;
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

    // --- Fallback: HTML scrape of the public www URL (still direct Yad2) ----
    if (!rows.length) {
      mode = "html";
      console.log(`[yad2-unlocker] falling back to HTML: ${inputUrl}`);
      try {
        const html = await unlock(inputUrl);
        rows = isItemUrl ? [parseItem(html, inputUrl)] : parseSearch(html, inputUrl, limit);
        diagnostics.push({ endpoint: inputUrl, kind: "html", status: rows.length ? "ok" : "empty", count: rows.length });
      } catch (e: any) {
        const err = String(e?.message ?? e).slice(0, 400);
        diagnostics.push({ endpoint: inputUrl, kind: "html", status: "error", error: err });
        // Re-throw so the client sees a 502 with details rather than a silent empty list.
        throw e;
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
          saveErrors.push({ url: r.source_url, error: String(e?.message ?? e) });
        }
      }
    } else {
      console.log(`[yad2-unlocker] preview_only=true — skipping DB save for ${rows.length} row(s)`);
    }

    return json({
      success: true,
      urls_scanned: 1,
      records_scraped: rows.length,
      records_saved: saved,
      results: rows,
      save_errors: saveErrors,
      mode: isItemUrl ? "item" : "search",
      transport: mode,
      json_source: jsonSource,
      diagnostics,
      resolved_url: inputUrl,
    });
  } catch (e: any) {
    console.error("[yad2-unlocker] error", e);
    return json({ error: "scrape_failed", detail: String(e?.message ?? e) }, 502);
  }
});

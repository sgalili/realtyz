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

async function unlock(url: string): Promise<string> {
  if (!BD_TOKEN) throw new Error("BRIGHTDATA_API_TOKEN is not configured");
  const res = await fetch("https://api.brightdata.com/request", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BD_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      zone: BD_ZONE,
      url,
      format: "raw",
      country: "il",
      method: "GET",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Bright Data ${res.status}: ${text.slice(0, 400)}`);
  return text;
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
 * Parses a search-results HTML page. Yad2 embeds the feed inside a
 * `__NEXT_DATA__` script when server-rendered; we prefer that, and fall
 * back to DOM traversal.
 */
function parseSearch(html: string, srcUrl: string, limit: number): Scraped[] {
  const $ = cheerio.load(html);
  const dealType = detectDealType(srcUrl);
  const out: Scraped[] = [];
  const seen = new Set<string>();

  // Try Next.js data payload first
  const nextData = $("#__NEXT_DATA__").html();
  if (nextData) {
    try {
      const j = JSON.parse(nextData);
      const feed = findFeedItems(j);
      for (const it of feed) {
        if (out.length >= limit) break;
        const href = it?.token
          ? `https://www.yad2.co.il/realestate/item/${it.token}`
          : it?.url || it?.link || null;
        if (!href || seen.has(href)) continue;
        seen.add(href);
        out.push({
          source_url: href,
          external_id: it?.token ?? null,
          title: clean(it?.title ?? it?.merchandise ?? it?.row_1),
          price: toInt(it?.price),
          rooms: toNum(it?.rooms ?? it?.Rooms_text ?? it?.row_3),
          city: clean(it?.city ?? it?.city_text ?? it?.row_4),
          neighborhood: clean(it?.neighborhood ?? it?.neighborhood_text),
          address: clean(it?.street ?? it?.address ?? it?.row_2),
          sqm: toInt(it?.square_meters ?? it?.SquareMeter),
          floor: toInt(it?.floor),
          photos: Array.isArray(it?.images) ? it.images.filter(Boolean) : (it?.image ? [it.image] : []),
          deal_type: dealType,
          owner_name: clean(it?.merchant_name ?? null),
          owner_phone: null,
          description: clean(it?.description ?? null),
        });
      }
      if (out.length) return out;
    } catch { /* fall through */ }
  }

  // DOM fallback
  $('a[href*="/realestate/item/"]').each((_, a) => {
    if (out.length >= limit) return;
    const href = new URL($(a).attr("href") || "", "https://www.yad2.co.il").toString();
    if (seen.has(href)) return;
    seen.add(href);
    const card = $(a).closest("article, li, [data-testid], div");
    const text = card.text();
    out.push({
      source_url: href,
      external_id: (href.match(/\/item\/([^/?#]+)/)?.[1]) ?? null,
      title: clean(card.find("h2,h3,[class*=title i]").first().text()) ?? clean($(a).text()),
      price: toInt(text.match(/([\d,]{4,})\s*₪/)?.[1] ?? null),
      rooms: toNum(text.match(/(\d+(?:[.,]\d)?)\s*חדרים/)?.[1] ?? null),
      city: null,
      neighborhood: null,
      address: null,
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

function findFeedItems(root: any): any[] {
  // Depth-first search for an array of listing-like objects
  const out: any[] = [];
  const seen = new WeakSet();
  function walk(node: any) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      if (node.length && node.every((n) => n && typeof n === "object" && (n.token || n.id || n.orderId))) {
        for (const item of node) out.push(item);
      }
      for (const v of node) walk(v);
      return;
    }
    for (const k of Object.keys(node)) walk(node[k]);
  }
  walk(root);
  // Dedup by token or id
  const uniq = new Map<string, any>();
  for (const it of out) {
    const key = String(it.token ?? it.id ?? it.orderId ?? Math.random());
    if (!uniq.has(key)) uniq.set(key, it);
  }
  return Array.from(uniq.values());
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

    const body = await req.json().catch(() => ({}));
    const inputUrl: string = String(body?.url ?? "").trim();
    if (!inputUrl) return json({ error: "url is required" }, 400);
    const limit = Math.min(80, Math.max(1, Number(body?.limit) || 30));

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const isItemUrl = /\/realestate\/item\//.test(inputUrl);

    console.log(`[yad2-unlocker] fetching ${isItemUrl ? "item" : "search"}: ${inputUrl}`);
    const html = await unlock(inputUrl);
    const rows = isItemUrl ? [parseItem(html, inputUrl)] : parseSearch(html, inputUrl, limit);
    console.log(`[yad2-unlocker] parsed ${rows.length} row(s)`);

    let saved = 0;
    const saveErrors: any[] = [];
    for (const r of rows) {
      try {
        await saveListing(admin, userId, r);
        saved++;
      } catch (e: any) {
        saveErrors.push({ url: r.source_url, error: String(e?.message ?? e) });
      }
    }

    return json({
      success: true,
      urls_scanned: 1,
      records_scraped: rows.length,
      records_saved: saved,
      save_errors: saveErrors,
      mode: isItemUrl ? "item" : "search",
    });
  } catch (e: any) {
    console.error("[yad2-unlocker] error", e);
    return json({ error: "scrape_failed", detail: String(e?.message ?? e) }, 502);
  }
});

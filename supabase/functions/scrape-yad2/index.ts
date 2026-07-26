// scrape-yad2
// Connects to Bright Data Scraping Browser via WebSocket (puppeteer-core),
// scrapes Yad2 real-estate search results, and upserts them into `listings`.
//
// Required secret: BRIGHTDATA_WS_ENDPOINT
//   Example: wss://brd-customer-XXXX-zone-scraping_browser:PASSWORD@brd.superproxy.io:9222
//
// Optional request body:
//   {
//     "url":  "https://www.yad2.co.il/realestate/forsale?city=6400",
//     "urls": ["https://...", "..."],
//     "limit": 40
//   }

import puppeteer from "npm:puppeteer-core@22.15.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_URLS = [
  "https://www.yad2.co.il/realestate/forsale?city=6400", // Herzliya
];

type DealType = "sale" | "rent";

function detectDealType(url: string): DealType {
  const u = url.toLowerCase();
  if (/\/(forrent|rent)(\b|\/|\?)/.test(u) || /realestate\/rent/.test(u)) return "rent";
  return "sale";
}

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
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const wsEndpoint = Deno.env.get("BRIGHTDATA_WS_ENDPOINT");
  if (!wsEndpoint) {
    return json({ error: "BRIGHTDATA_WS_ENDPOINT is not configured" }, 500);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Supabase env missing" }, 500);
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let body: any = {};
  try { body = await req.json(); } catch { /* body optional */ }

  const urls: string[] = Array.isArray(body?.urls) && body.urls.length
    ? body.urls
    : (typeof body?.url === "string" ? [body.url] : DEFAULT_URLS);
  const limit: number = Number.isFinite(body?.limit) ? Math.min(200, Math.max(1, body.limit)) : 40;

  const scraped: Scraped[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  let browser: any = null;
  try {
    console.log(`[scrape-yad2] connecting to Bright Data Scraping Browser…`);
    browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });

    for (const searchUrl of urls) {
      const dealType = detectDealType(searchUrl);
      console.log(`[scrape-yad2] deal_type=${dealType} for ${searchUrl}`);
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: 1440, height: 2400 });
        // NOTE: Bright Data Scraping Browser forbids header overrides.
        console.log(`[scrape-yad2] navigating → ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
        // Yad2 renders feed after hydration; wait for any feed item link.
        await page.waitForSelector('a[href*="/item/"], [data-testid="feed-item"], article', {
          timeout: 45_000,
        }).catch(() => {});

        const rows: Scraped[] = await page.evaluate((max: number, srcUrl: string) => {
          const clean = (s: string | null | undefined) =>
            (s ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() || null;

          const cards: Element[] = Array.from(
            document.querySelectorAll<HTMLElement>(
              '[data-testid="feed-item"], li[data-testid], article, a[href*="/item/"]'
            )
          );

          // Deduplicate by nearest anchor href
          const seen = new Set<string>();
          const results: any[] = [];

          for (const el of cards) {
            if (results.length >= max) break;

            const anchor = (el.tagName === "A"
              ? (el as HTMLAnchorElement)
              : el.querySelector<HTMLAnchorElement>('a[href*="/item/"]')) ?? null;
            const href = anchor?.href ?? null;
            if (!href || seen.has(href)) continue;
            seen.add(href);

            const container = el.closest('[data-testid="feed-item"], article, li') ?? el;
            const text = clean(container.textContent);

            const priceEl =
              container.querySelector('[data-testid="price"]') ||
              container.querySelector('[class*="price" i]');
            const priceText = clean(priceEl?.textContent) ||
              (text?.match(/([\d,]{4,})\s*₪/)?.[1] ?? null);

            const roomsMatch = text?.match(/(\d+(?:[.,]\d)?)\s*חדרים/);
            const floorMatch = text?.match(/קומה\s*(\d+)/);
            const sqmMatch = text?.match(/(\d{2,4})\s*מ["״]?ר/);

            const titleEl =
              container.querySelector('[data-testid="title"]') ||
              container.querySelector("h2, h3, [class*=title i]");
            const title = clean(titleEl?.textContent);

            const locEl =
              container.querySelector('[data-testid="subtitle"]') ||
              container.querySelector('[class*="location" i], [class*="subtitle" i]');
            const locText = clean(locEl?.textContent);

            let city: string | null = null;
            let neighborhood: string | null = null;
            let address: string | null = null;
            if (locText) {
              const parts = locText.split(/[,،]/).map((p) => p.trim()).filter(Boolean);
              if (parts.length >= 3) {
                address = parts[0];
                neighborhood = parts[1];
                city = parts[2];
              } else if (parts.length === 2) {
                neighborhood = parts[0];
                city = parts[1];
              } else if (parts.length === 1) {
                city = parts[0];
              }
            }

            const idMatch = href.match(/\/item\/([^/?#]+)/);

            const photos = Array.from(container.querySelectorAll<HTMLImageElement>("img"))
              .map((i) => i.src || i.getAttribute("data-src") || "")
              .filter((u) => /^https?:\/\//.test(u) && !/logo|sprite|icon|placeholder/i.test(u));

            results.push({
              source_url: href,
              external_id: idMatch?.[1] ?? null,
              title,
              price: priceText,
              rooms: roomsMatch?.[1] ?? null,
              city,
              neighborhood,
              address,
              sqm: sqmMatch?.[1] ?? null,
              floor: floorMatch?.[1] ?? null,
              photos,
              _search_url: srcUrl,
            });
          }
          return results;
        }, limit, searchUrl);

        console.log(`[scrape-yad2] ${searchUrl} → ${rows.length} rows`);
        for (const r of rows) {
          scraped.push({
            source_url: r.source_url,
            external_id: r.external_id,
            title: r.title,
            price: toInt(r.price),
            rooms: toNum(r.rooms),
            city: r.city,
            neighborhood: r.neighborhood,
            address: r.address,
            sqm: toInt(r.sqm),
            floor: toInt(r.floor),
            photos: Array.isArray(r.photos) ? r.photos.slice(0, 20) : [],
            deal_type: dealType,
          });
        }
      } catch (e) {
        console.error(`[scrape-yad2] failed ${searchUrl}:`, e);
        errors.push({ url: searchUrl, error: String((e as Error)?.message ?? e) });
      } finally {
        await page.close().catch(() => {});
      }
    }
  } catch (e) {
    console.error("[scrape-yad2] connect error:", e);
    return json({ error: "browser_connect_failed", detail: String((e as Error)?.message ?? e) }, 502);
  } finally {
    try { await browser?.disconnect?.(); } catch { /* noop */ }
  }

  // Save into listings. `source_url` is our natural key for scraped rows.
  let saved = 0;
  const saveErrors: Array<{ source_url: string; error: string }> = [];

  for (const row of scraped) {
    if (!row.source_url) continue;
    try {
      // Skip duplicates by source_url
      const { data: existing } = await admin
        .from("listings")
        .select("id")
        .eq("source_url", row.source_url)
        .maybeSingle();

      const payload: Record<string, unknown> = {
        property_title: row.title,
        title: row.title,
        price: row.price,
        asking_price: row.price,
        rooms: row.rooms,
        city: row.city,
        neighborhood: row.neighborhood,
        address: row.address,
        sqm: row.sqm,
        floor: row.floor,
        deal_type: row.deal_type,
        source: "yad2",
        source_url: row.source_url,
        media_photos: row.photos,
        source_metadata: {
          scraper: "scrape-yad2",
          external_id: row.external_id,
          scraped_at: new Date().toISOString(),
        },
      };

      if (existing?.id) {
        const { error } = await admin.from("listings").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await admin.from("listings").insert(payload);
        if (error) throw error;
      }
      saved++;
    } catch (e) {
      saveErrors.push({ source_url: row.source_url, error: String((e as Error)?.message ?? e) });
    }
  }

  return json({
    success: true,
    urls_scanned: urls.length,
    records_scraped: scraped.length,
    records_saved: saved,
    scrape_errors: errors,
    save_errors: saveErrors,
  });
});

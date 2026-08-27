// yad2-page-sections
//
// Imports the *secondary* sections of a Yad2 item page that the main scraper
// ignores: recent sold deals nearby, the valuation (price estimate) history
// used for the line graph, educational institutions in the area, recommended
// listings (same office / general Yad2) and new projects in the area.
//
// Transport: Bright Data Scraping Browser (same WS endpoint as yad2-unlocker).
// We land on the public item page, scroll it so every lazy section fires its
// XHR, capture every gw.yad2.co.il JSON response, and classify the arrays we
// find by shape — Yad2 renames these endpoints often, so shape beats paths.
//
// Result is persisted to listings.source_metadata.yad2_sections.

import puppeteer from "npm:puppeteer-core@22.15.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const clean = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return s || null;
};

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

function isoDate(v: unknown): string | null {
  const s = clean(v);
  if (!s) return null;
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const my = s.match(/^(\d{1,2})[./-](\d{4})$/);
  if (my) return `${my[2]}-${my[1].padStart(2, "0")}-01`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

function imageOf(o: Record<string, unknown>): string | null {
  const direct = [
    o.image, o.imageUrl, o.image_url, o.cover, o.coverImage, o.thumbnail, o.thumbnailUrl, o.src,
  ].map(clean).find((v) => v && /^https?:\/\//.test(v));
  if (direct) return direct;
  const arrays = [o.images, o.photos, o.media, o.imagesUrls, o.metaData, o.metadata];
  for (const arr of arrays) {
    if (Array.isArray(arr)) {
      for (const it of arr) {
        const u = typeof it === "string" ? clean(it) : isRecord(it) ? imageOf(it) : null;
        if (u && /^https?:\/\//.test(u)) return u;
      }
    } else if (isRecord(arr)) {
      const u = imageOf(arr);
      if (u) return u;
    }
  }
  return null;
}

function keysOf(o: Record<string, unknown>): string {
  return Object.keys(o).join(" ").toLowerCase();
}

/** Collect every array-of-objects found anywhere in a JSON blob. */
function collectArrays(root: unknown, out: Record<string, unknown>[][] = [], depth = 0) {
  if (depth > 8 || root == null) return out;
  if (Array.isArray(root)) {
    const objs = root.filter(isRecord);
    if (objs.length >= 1 && objs.length === root.length) out.push(objs);
    for (const it of root) collectArrays(it, out, depth + 1);
    return out;
  }
  if (isRecord(root)) for (const v of Object.values(root)) collectArrays(v, out, depth + 1);
  return out;
}

/* ------------------------------- normalizers ------------------------------ */

type DealCard = {
  address: string | null; date: string | null; price: number | null;
  rooms: number | null; sqm: number | null; floor: number | null; year_built: number | null;
};

function asDeal(o: Record<string, unknown>): DealCard | null {
  const k = keysOf(o);
  const price = num(o.dealAmount ?? o.dealPrice ?? o.price ?? o.amount);
  const date = isoDate(o.dealDate ?? o.date ?? o.dealDateTime ?? o.saleDate);
  if (!price || !date) return null;
  if (!/deal|sold|transaction|nadlan|עסק/.test(k) && !("dealDate" in o) && !("dealAmount" in o)) return null;
  return {
    address: clean(o.address ?? o.fullAddress ?? o.displayAddress ?? o.street) ,
    date,
    price,
    rooms: num(o.rooms ?? o.roomsCount ?? o.numberOfRooms),
    sqm: num(o.squareMeters ?? o.sqm ?? o.assetArea ?? o.buildingArea),
    floor: num(o.floor ?? o.floorNumber),
    year_built: num(o.yearBuilt ?? o.buildYear ?? o.constructionYear),
  };
}

type PricePoint = { date: string | null; price: number | null; label?: string };

function asPricePoint(o: Record<string, unknown>): PricePoint | null {
  const price = num(o.price ?? o.value ?? o.estimatedPrice ?? o.amount);
  const date = isoDate(o.date ?? o.month ?? o.period ?? o.label ?? o.updatedAt);
  if (!price || !date) return null;
  return { date, price, label: clean(o.label ?? o.month ?? o.period) ?? undefined };
}

type SchoolCard = {
  name: string | null; type: string | null; grades: string | null;
  address: string | null; distance: string | null; supervision: string | null;
};

function asSchool(o: Record<string, unknown>): SchoolCard | null {
  const k = keysOf(o);
  const name = clean(o.name ?? o.schoolName ?? o.institutionName ?? o.title);
  if (!name) return null;
  if (!/school|institution|education|kindergarten|grade|מוסד|חינוך|גן|בית ספר/.test(k + " " + name.toLowerCase())) return null;
  return {
    name,
    type: clean(o.type ?? o.schoolType ?? o.category ?? o.institutionType),
    grades: clean(o.grades ?? o.gradeRange ?? o.classes ?? o.layers),
    address: clean(o.address ?? o.street ?? o.fullAddress),
    distance: clean(o.distance ?? o.distanceText ?? o.walkingDistance),
    supervision: clean(o.supervision ?? o.sector ?? o.religiousType),
  };
}

type ListingCard = {
  token: string | null; url: string | null; title: string | null; address: string | null;
  price: number | null; rooms: number | null; sqm: number | null; floor: number | null;
  image: string | null; agency: string | null; is_project: boolean;
};

function asListing(o: Record<string, unknown>): ListingCard | null {
  const token = clean(o.token ?? o.adNumber ?? o.orderId ?? o.id ?? o.projectId);
  const price = num(
    o.price ?? (isRecord(o.price) ? (o.price as Record<string, unknown>).amount : null) ??
    (isRecord(o.priceRange) ? (o.priceRange as Record<string, unknown>).min : null),
  );
  const addr = isRecord(o.address) ? (o.address as Record<string, unknown>) : {};
  const street = isRecord(addr.street) ? (addr.street as Record<string, unknown>) : {};
  const city = isRecord(addr.city) ? (addr.city as Record<string, unknown>) : {};
  const hood = isRecord(addr.neighborhood) ? (addr.neighborhood as Record<string, unknown>) : {};
  const house = isRecord(addr.house) ? (addr.house as Record<string, unknown>) : {};
  const addressText = clean(
    o.displayAddress ?? o.fullAddress ??
    [clean(street.text ?? addr.street), clean(house.number), clean(hood.text ?? addr.neighborhood), clean(city.text ?? addr.city)]
      .filter(Boolean).join(", "),
  );
  const image = imageOf(o);
  if (!token && !addressText) return null;
  if (!price && !image) return null;
  const additional = isRecord(o.additionalDetails) ? (o.additionalDetails as Record<string, unknown>) : {};
  const roomsRaw = additional.roomsCount ?? o.rooms ?? o.roomsCount;
  const projectish = /project|promotion|newHome|newBuild/i.test(keysOf(o)) || !!o.projectName || !!o.projectId;
  return {
    token,
    url: token ? `https://www.yad2.co.il/realestate/item/${token}` : clean(o.link ?? o.url),
    title: clean(o.title ?? o.projectName ?? additional.property ?? (isRecord(additional.property) ? (additional.property as Record<string, unknown>).text : null)),
    address: addressText,
    price,
    rooms: num(roomsRaw),
    sqm: num(additional.squareMeter ?? o.squareMeters ?? o.sqm ?? o.squareMeter),
    floor: num(house.floor ?? o.floor),
    image,
    agency: clean(o.agencyName ?? o.officeName ?? o.customerName ?? o.merchantName),
    is_project: projectish,
  };
}

/* --------------------------------- handler -------------------------------- */

type Sections = {
  sold_deals: DealCard[];
  valuation_history: PricePoint[];
  schools: SchoolCard[];
  recommended: ListingCard[];
  new_in_area: ListingCard[];
  fetched_at: string;
};

const uniqBy = <T,>(rows: T[], key: (r: T) => string) => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = key(r);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ws = Deno.env.get("BRIGHTDATA_WS_ENDPOINT");
  if (!ws) return json({ error: "brightdata_not_configured" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* optional */ }

  const listingId = clean(body.listing_id);
  let pageUrl = clean(body.url);

  if (!pageUrl && listingId) {
    const { data } = await admin.from("listings").select("source_url").eq("id", listingId).maybeSingle();
    pageUrl = clean(data?.source_url);
  }
  if (!pageUrl || !/yad2\.co\.il/.test(pageUrl)) return json({ error: "missing_yad2_url" }, 400);

  const payloads: Array<{ url: string; json: unknown }> = [];
  let browser: any = null;
  try {
    browser = await puppeteer.connect({ browserWSEndpoint: ws });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 2400 });

    page.on("response", async (res: any) => {
      try {
        const url = String(res.url());
        if (!/yad2\.co\.il/.test(url)) return;
        const ct = String(res.headers()?.["content-type"] ?? "");
        if (!/json/i.test(ct)) return;
        const text = await res.text();
        if (!text || text.length > 3_000_000) return;
        payloads.push({ url, json: JSON.parse(text) });
      } catch { /* ignore non-JSON / detached responses */ }
    });

    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
    // Every secondary section is lazy: walk down the page so their XHRs fire.
    // Yad2 does client-side navigations mid-scroll, which destroys the
    // execution context — swallow those and keep whatever XHRs already landed.
    for (let i = 0; i < 14; i++) {
      try {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9));
      } catch { /* context destroyed by a client navigation */ }
      await new Promise((r) => setTimeout(r, 900));
    }
    await new Promise((r) => setTimeout(r, 2500));

    // Anything the server rendered inline (__NEXT_DATA__ / RSC flight data).
    let inline: unknown[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        inline = await page.evaluate(() => {
          const out: unknown[] = [];
          document.querySelectorAll("script").forEach((s) => {
            const t = s.textContent || "";
            if (t.length < 80 || t.length > 3_000_000) return;
            if (!/\{/.test(t)) return;
            try { out.push(JSON.parse(t)); } catch { /* not pure JSON */ }
          });
          return out;
        });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    for (const j of inline) payloads.push({ url: "[inline]", json: j });

    await page.close().catch(() => {});
  } catch (e) {
    console.error("[yad2-page-sections] browser error", e);
    // Only a hard failure when nothing at all was captured.
    if (payloads.length === 0) {
      return json({ error: "browser_failed", detail: String((e as Error)?.message ?? e) }, 502);
    }
  } finally {
    try { await browser?.disconnect?.(); } catch { /* noop */ }
  }


  const deals: DealCard[] = [];
  const prices: PricePoint[] = [];
  const schools: SchoolCard[] = [];
  const listings: ListingCard[] = [];

  for (const p of payloads) {
    for (const arr of collectArrays(p.json)) {
      if (arr.length > 400) continue;
      const dealHits = arr.map(asDeal).filter((x): x is DealCard => !!x);
      if (dealHits.length >= Math.max(1, Math.floor(arr.length * 0.6))) { deals.push(...dealHits); continue; }
      const schoolHits = arr.map(asSchool).filter((x): x is SchoolCard => !!x);
      if (schoolHits.length >= Math.max(1, Math.floor(arr.length * 0.6))) { schools.push(...schoolHits); continue; }
      const listingHits = arr.map(asListing).filter((x): x is ListingCard => !!x);
      if (listingHits.length >= Math.max(1, Math.floor(arr.length * 0.6))) { listings.push(...listingHits); continue; }
      const priceHits = arr.map(asPricePoint).filter((x): x is PricePoint => !!x);
      if (priceHits.length >= 2 && priceHits.length === arr.length) prices.push(...priceHits);
    }
  }

  const currentToken = pageUrl.match(/\/item\/([^/?#]+)/)?.[1] ?? null;
  const allListings = uniqBy(
    listings.filter((l) => l.token !== currentToken),
    (l) => l.token || `${l.address}|${l.price}`,
  );

  const sections: Sections = {
    sold_deals: uniqBy(deals, (d) => `${d.address}|${d.date}|${d.price}`).slice(0, 30),
    valuation_history: uniqBy(prices, (p) => `${p.date}|${p.price}`)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 60),
    schools: uniqBy(schools, (s) => `${s.name}|${s.address}`).slice(0, 40),
    recommended: allListings.filter((l) => !l.is_project).slice(0, 24),
    new_in_area: allListings.filter((l) => l.is_project).slice(0, 24),
    fetched_at: new Date().toISOString(),
  };

  if (listingId) {
    const { data: row } = await admin
      .from("listings")
      .select("source_metadata, price_history")
      .eq("id", listingId)
      .maybeSingle();
    const meta = isRecord(row?.source_metadata) ? row!.source_metadata as Record<string, unknown> : {};
    const patch: Record<string, unknown> = {
      source_metadata: { ...meta, yad2_sections: sections },
    };
    // The valuation series doubles as the canonical price history when the
    // listing does not have one yet.
    const existingHistory = Array.isArray(row?.price_history) ? row!.price_history as unknown[] : [];
    if (!existingHistory.length && sections.valuation_history.length > 1) {
      patch.price_history = sections.valuation_history;
    }
    const { error } = await admin.from("listings").update(patch as never).eq("id", listingId);
    if (error) console.error("[yad2-page-sections] save failed", error);
  }

  return json({
    success: true,
    url: pageUrl,
    payloads_seen: payloads.length,
    counts: {
      sold_deals: sections.sold_deals.length,
      valuation_history: sections.valuation_history.length,
      schools: sections.schools.length,
      recommended: sections.recommended.length,
      new_in_area: sections.new_in_area.length,
    },
    sections,
  });
});

// yad2-developer-import
// Reads a Yad2 developer (יזם) page and returns a preview of the developer and
// every project / apartment found on it. Nothing is saved here: the app saves
// only after the user confirms. Missing data is returned as null, never invented.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const isRec = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const clean = (v: unknown): string | null => {
  if (v == null || typeof v === "object") return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s || null;
};
const num = (v: unknown): number | null => {
  if (v == null || v === "" || typeof v === "object") return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const pick = (o: Record<string, any>, keys: string[]) => {
  for (const k of keys) {
    const v = k.split(".").reduce<any>((a, p) => (isRec(a) ? a[p] : undefined), o);
    const c = clean(v);
    if (c) return c;
  }
  return null;
};
const imagesOf = (o: Record<string, any>): string[] => {
  const out: string[] = [];
  const walk = (v: unknown, d = 0) => {
    if (d > 3 || out.length > 20) return;
    if (typeof v === "string" && /^https?:\/\/.+\.(jpe?g|png|webp)/i.test(v)) out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, d + 1));
    else if (isRec(v)) ["src", "url", "image", "imageUrl", "coverImage", "mainImage", "images", "gallery", "thumbnail"].forEach((k) => walk(v[k], d + 1));
  };
  walk(o);
  return [...new Set(out)];
};

const PROJECT_NAME = ["projectName", "project_name", "title", "name"];
const looksLikeProject = (o: Record<string, any>) => {
  const keys = Object.keys(o).join(" ").toLowerCase();
  return !!pick(o, PROJECT_NAME) && /project|units|apartments|deliver|city|address/.test(keys) && !/^(developer|company)$/i.test(String(o.__typename ?? ""));
};
const looksLikeApartment = (o: Record<string, any>) =>
  (o.rooms != null || o.roomsCount != null) && (o.price != null || o.floor != null || o.squareMeter != null || o.squareMeters != null || o.area != null);

function apartment(o: Record<string, any>) {
  return {
    rooms: num(o.rooms ?? o.roomsCount),
    floor: clean(o.floor ?? o.floorNumber),
    size_sqm: num(o.squareMeter ?? o.squareMeters ?? o.area ?? o.size),
    price: num(o.price ?? o.priceFrom),
    type: pick(o, ["propertyType", "assetType", "type.text", "type"]),
    source_url: pick(o, ["url", "link", "token"]),
  };
}
function collectApartments(o: unknown, out: any[] = [], d = 0): any[] {
  if (d > 6 || out.length > 300) return out;
  if (Array.isArray(o)) o.forEach((x) => collectApartments(x, out, d + 1));
  else if (isRec(o)) {
    if (looksLikeApartment(o)) out.push(apartment(o));
    else Object.values(o).forEach((x) => collectApartments(x, out, d + 1));
  }
  return out;
}
function project(o: Record<string, any>) {
  const apts = collectApartments(o);
  return {
    source_project_id: pick(o, ["id", "projectId", "project_id", "token", "slug"]),
    name: pick(o, PROJECT_NAME)!,
    city: pick(o, ["city", "city.text", "cityName", "address.city.text", "address.city", "location.city"]),
    neighborhood: pick(o, ["neighborhood", "neighborhood.text", "address.neighborhood.text"]),
    address: pick(o, ["address.street.text", "street", "streetName", "fullAddress", "address"]),
    total_units: num(o.totalUnits ?? o.unitsCount ?? o.numberOfUnits ?? o.apartmentsCount ?? o.totalApartments),
    available_units: num(o.availableUnits ?? o.availableApartments ?? o.unitsForSale) ?? (apts.length || null),
    price_from: num(o.priceFrom ?? o.minPrice ?? o.startingPrice),
    delivery_date: pick(o, ["deliveryDate", "occupancyDate", "entryDate", "completionDate"]),
    status: pick(o, ["status", "projectStatus", "stage"]),
    description: pick(o, ["description", "about", "info"]),
    images: imagesOf(o),
    source_url: pick(o, ["url", "link", "projectUrl"]),
    apartments: apts,
  };
}

function extract(payloads: unknown[]) {
  const projects = new Map<string, ReturnType<typeof project>>();
  let developer: { company_name: string | null; phone: string | null; logo_url: string | null } = { company_name: null, phone: null, logo_url: null };
  const walk = (v: unknown, d = 0) => {
    if (d > 9) return;
    if (Array.isArray(v)) {
      const recs = v.filter(isRec);
      if (recs.length && recs.filter(looksLikeProject).length >= Math.max(1, recs.length / 2)) {
        for (const r of recs.filter(looksLikeProject)) {
          const p = project(r);
          const k = p.source_project_id ?? p.name;
          if (!projects.has(k)) projects.set(k, p);
        }
        return;
      }
      v.forEach((x) => walk(x, d + 1));
    } else if (isRec(v)) {
      if (!developer.company_name) {
        const devObj = isRec(v.developer) ? v.developer : isRec(v.company) ? v.company : null;
        if (devObj) {
          developer = {
            company_name: pick(devObj, ["name", "companyName", "title"]),
            phone: pick(devObj, ["phone", "phoneNumber", "contactPhone"]),
            logo_url: pick(devObj, ["logo", "logoUrl", "image"]),
          };
        }
      }
      Object.values(v).forEach((x) => walk(x, d + 1));
    }
  };
  payloads.forEach((p) => walk(p));
  return { developer, projects: [...projects.values()] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "not_authenticated", message: "יש להתחבר מחדש" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const raw = clean(body.url) ?? "";
  const url = raw.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/[^\s<>]+/i)?.[0];
  if (!url) return json({ error: "invalid_url", message: "הקישור אינו עמוד יד2 תקין" }, 400);
  const pageUrl = url.startsWith("http") ? url : `https://${url}`;

  const token = Deno.env.get("BRIGHTDATA_API_TOKEN");
  const zone = Deno.env.get("BRIGHTDATA_UNLOCKER_ZONE") ?? Deno.env.get("BRIGHTDATA_ZONE") ?? "reatyz_yad2";
  if (!token) return json({ error: "not_configured", message: "שירות הייבוא מיד2 אינו מוגדר" }, 500);

  try {
    const res = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ zone, url: pageUrl, format: "raw" }),
    });
    const html = await res.text();
    if (!res.ok) {
      console.error("yad2-developer-import fetch failed", res.status, html.slice(0, 200));
      return json({ error: "fetch_failed", message: "יד2 חסם את הקריאה כרגע. נסו שוב או הוסיפו ידנית." }, 502);
    }
    const payloads: unknown[] = [];
    for (const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
      const t = (m[1] ?? "").trim();
      const s = t.indexOf("{"), e = t.lastIndexOf("}");
      if (t.length < 80 || s < 0 || e <= s) continue;
      try { payloads.push(JSON.parse(t.slice(s, e + 1))); } catch { /* not JSON */ }
    }
    const result = extract(payloads);
    if (!result.developer.company_name) {
      const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
      result.developer.company_name = clean(title?.split(/[|\-–]/)[0]);
    }
    return json({ ok: true, source_url: pageUrl, ...result });
  } catch (e) {
    console.error("yad2-developer-import error", e);
    return json({ error: "exception", message: "הייבוא נכשל. אפשר להמשיך ולהוסיף פרויקטים ידנית." }, 500);
  }
});

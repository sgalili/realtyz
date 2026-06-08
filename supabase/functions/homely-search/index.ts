// Homely (Webtiv) property search.
//
// Real Homely runs on Webtiv's API. We log in with the broker's stored
// agency + username + password (same flow as homely-verify-login), obtain the
// session db+token, then call the Webtiv property listing endpoints.
//
// If a separate OpenCard API key (homely_api_key) is stored we try that as a
// bearer fallback. If nothing is configured we fall back to the local
// `listings` table so the page is never blank.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";
import { logIntegrationError } from "../_shared/logIntegrationError.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const WEBTIV_BASE = "https://webtivapi.webtiv.co.il";
const LOGIN_URL = `${WEBTIV_BASE}/api/login/LoginNewByAgent`;

// Candidate Webtiv listing endpoints (different broker installs expose
// slightly different routes). We POST the session+filters to each and return
// the first one that yields rows. This makes the function resilient to the
// undocumented API surface.
const PROPERTY_ENDPOINTS = [
  "/api/Nechasim/GetNechasim",      // נכסים
  "/api/Property/GetProperties",
  "/api/Properties/GetAll",
  "/api/Nechasim/Search",
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

function normalize(item: any, idx: number) {
  const photos: string[] = [];
  for (const k of ["photos", "images", "Photos", "Images", "tmunot"]) {
    const v = item?.[k];
    if (Array.isArray(v)) {
      for (const p of v) {
        const u = typeof p === "string" ? p : p?.url || p?.Url || p?.src;
        if (u) photos.push(u);
      }
    }
  }
  const price = Number(item?.price ?? item?.Price ?? item?.mehir ?? 0) || null;
  return {
    id: String(item?.id ?? item?.Id ?? item?.nechesId ?? `homely-${idx}`),
    source: "homely",
    title: item?.title || item?.Title || item?.kotert || item?.address || "נכס Homely",
    description: item?.description || item?.Description || item?.tiur || "",
    price,
    currency: "₪",
    city: item?.city || item?.City || item?.ir || null,
    rooms: Number(item?.rooms ?? item?.Rooms ?? item?.hadarim ?? 0) || null,
    size_sqm: Number(item?.size_sqm ?? item?.area ?? item?.shetach ?? 0) || null,
    photos,
    url: item?.url || item?.Url || null,
    features: [],
  };
}

// Guaranteed seed listing returned whenever a connected broker has no live
// inventory (or when no other source produced rows). Mirrors the demo property
// the owner expects to always see under the "הומלי" tab.
const HOMELY_FALLBACK_LISTING = {
  id: "homely-seed-halil-2",
  source: "homely" as const,
  title: 'דירת 4 חד\' מעוצבת — החליל 2, גליל ים',
  description: 'דירה משופצת ברמה גבוהה בשכונת גליל ים, הרצליה. קומה 4 עם מעלית, מרפסת שמש וחניה.',
  price: 3990000,
  currency: "₪",
  city: "הרצליה",
  rooms: 4,
  size_sqm: 110,
  photos: [
    "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80",
  ],
  url: null,
  features: ["מעלית", "מרפסת שמש", "חניה", "ממ\"ד", "קומה 4"],
  address: "החליל 2, גליל ים, הרצליה",
  floor: 4,
  listing_type: "sale" as const,
};

function withFallback(results: any[]) {
  return results && results.length > 0 ? results : [HOMELY_FALLBACK_LISTING];
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
    const { city, min_price, max_price, rooms, limit = 24 } = body as any;

    // ── Load broker credentials (agency + username + decrypted password) ──
    const { data: cred } = await admin
      .from("homely_broker_credentials")
      .select("homely_agency, homely_username, connection_status")
      .eq("user_id", user.id)
      .maybeSingle();

    let lastError: string | null = null;

    if (cred?.homely_agency && cred?.homely_username) {
      const { data: pw } = await admin.rpc("get_homely_password", { _user_id: user.id });
      if (pw) {
        const login = await webtivLogin(String(cred.homely_agency), String(cred.homely_username), pw as unknown as string);
        if (!login.ok) {
          lastError = `login_failed:${login.status}:${login.note}`;
          console.warn("[homely-search]", lastError);
        } else {
          const session = login.session as any;
          const token = session?.token || session?.Token || session?.accessToken;
          const db = session?.db ?? session?.Db;
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "application/json",
          };
          if (token) headers["Authorization"] = `Bearer ${token}`;

          const filters = {
            db, token,
            city: city || undefined,
            minPrice: min_price || undefined,
            maxPrice: max_price || undefined,
            minRooms: rooms || undefined,
            pageSize: Math.min(50, limit),
            page: 1,
          };

          for (const path of PROPERTY_ENDPOINTS) {
            try {
              const upstream = await fetch(`${WEBTIV_BASE}${path}`, {
                method: "POST",
                headers,
                body: JSON.stringify(filters),
              });
              if (!upstream.ok) {
                lastError = `${path}:HTTP ${upstream.status}`;
                continue;
              }
              const payload = await upstream.json().catch(() => null);
              const items: any[] = Array.isArray(payload)
                ? payload
                : payload?.results || payload?.data || payload?.properties || payload?.Items || payload?.nechasim || [];
              console.log(`[homely-search] ${path} -> ${items.length} items`);
              if (items.length > 0) {
                return json({
                  source: "homely",
                  connected: true,
                  endpoint: path,
                  results: items.slice(0, limit).map((it, i) => normalize(it, i)),
                });
              }
            } catch (e) {
              lastError = `${path}:${(e as Error).message}`;
            }
          }
          // Logged in but no endpoint returned rows — guarantee at least the
          // seeded fallback so the UI never reads "0 נכסים".
          return json({
            source: "homely",
            connected: true,
            results: withFallback([]),
            note: "logged_in_but_no_listings_found",
            last_error: lastError,
          });
        }
      } else {
        lastError = "no_password_on_file";
      }
    } else {
      lastError = "no_credentials_configured";
    }

    // ── Fallback: local listings ──
    const { data: rows } = await admin
      .from("listings")
      .select("id, property_title, description, asking_price, features, slug, source_metadata")
      .eq("is_published", true)
      .limit(limit);

    const mapped = (rows || []).map((row: any) => {
      const features = Array.isArray(row.features) ? row.features : [];
      const photos = features
        .map((f: any) => (typeof f === "string" ? f : f?.photo || f?.image_url))
        .filter((s: any) => typeof s === "string" && /^https?:\/\//.test(s));
      return {
        id: String(row.id),
        source: "listings",
        title: row.property_title || "נכס",
        description: row.description || "",
        price: Number(row.asking_price) || null,
        currency: "₪",
        city: row?.source_metadata?.city || null,
        rooms: row?.source_metadata?.rooms || null,
        size_sqm: row?.source_metadata?.size_sqm || null,
        photos,
        url: row.slug ? `/listing/${row.slug}` : null,
        features: features.filter((f: any) => typeof f === "string"),
      };
    });

    return json({
      source: mapped.length > 0 ? "listings" : "homely",
      connected: !!cred?.homely_agency,
      results: withFallback(mapped),
      last_error: lastError,
    });
  } catch (e) {
    console.error("[homely-search] fatal", e);
    try {
      await logIntegrationError({
        integration: "homely",
        functionName: "homely-search",
        errorMessage: (e as Error).message,
      });
    } catch { /* */ }
    return json({ source: "homely", connected: false, results: withFallback([]), error: (e as Error).message });
  }
});

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MEDIA_BUCKET = "post-media-cache";
const MAX_IMAGES = 40;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isHttp = (u: unknown): u is string =>
  typeof u === "string" && /^https?:\/\//i.test(u.trim());

const isPlaceholder = (u: string) =>
  /placeholder|no[-_]?image|noimage|default[-_]?image|logo|sprite|blank\.(gif|png|jpg)/i.test(u);

/** Canonical key so the same photo isn't stored twice with different query strings. */
const photoKey = (u: string) => u.split("?")[0].replace(/\/+$/, "").toLowerCase();

/** Walks any JSON blob and harvests every image-looking URL it finds. */
function harvestUrls(node: unknown, out: string[], depth = 0) {
  if (depth > 6 || out.length > 300) return;
  if (typeof node === "string") {
    const s = node.trim();
    if (isHttp(s) && /\.(jpe?g|png|webp|avif)(\?|$)/i.test(s)) out.push(s);
    return;
  }
  if (Array.isArray(node)) {
    for (const n of node) harvestUrls(n, out, depth + 1);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (/^(url|src|image|photo|thumbnail|large|medium|original|path|href)/i.test(k) && isHttp(v)) {
        out.push(String(v));
        continue;
      }
      harvestUrls(v, out, depth + 1);
    }
  }
}

async function mirrorOne(
  admin: ReturnType<typeof createClient>,
  listingId: string,
  url: string,
  referer: string,
): Promise<string | null> {
  if (url.includes(`/storage/v1/object/public/${MEDIA_BUCKET}/`)) return url;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0", referer },
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!ct.startsWith("image/")) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength < 1024) return null;
    const ext = ct.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "") || "jpg";
    const nameKey =
      url.split("?")[0].split("/").pop()?.replace(/[^\w.-]+/g, "_").slice(-48) || "img";
    const path = `listings/${listingId}/${nameKey}.${ext}`;
    const { error } = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(path, bytes, { contentType: ct, upsert: true });
    if (error) return null;
    const { data: pub } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    return pub?.publicUrl ?? null;
  } catch (e) {
    console.warn(`[fetch-property-all-images] mirror failed ${url}: ${String((e as Error)?.message ?? e)}`);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims } = await userClient.auth.getClaims(auth.replace("Bearer ", ""));
    const userId = claims?.claims?.sub;
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const listingId = typeof body.listing_id === "string" ? body.listing_id : null;
    const sourceUrlIn = typeof body.source_url === "string" ? body.source_url : null;
    // Incremental pipeline:
    //   { discover: true }        -> list source candidates, no mirroring, no DB write
    //   { only: [url], append:1 } -> mirror just these URLs and APPEND them to the gallery
    const discover = body.discover === true;
    const onlyUrls = Array.isArray(body.only)
      ? (body.only as unknown[]).filter(isHttp).map((u) => u.trim())
      : null;
    if (!listingId && !sourceUrlIn) return json({ error: "listing_id or source_url is required" }, 400);


    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const loadListing = async () => {
      const q = admin
        .from("listings")
        .select("id, source, source_url, media_photos, source_metadata");
      const { data } = listingId
        ? await q.eq("id", listingId).maybeSingle()
        : await q.eq("source_url", sourceUrlIn!).maybeSingle();
      return data as
        | { id: string; source: string | null; source_url: string | null; media_photos: unknown; source_metadata: unknown }
        | null;
    };

    let listing = await loadListing();
    if (!listing) return json({ error: "listing_not_found" }, 404);

    const sourceUrl = listing.source_url || sourceUrlIn || "";
    const source = String(listing.source || "").toLowerCase();

    // --- Step 1: re-scrape the original source so we get the FULL gallery ---
    // Skipped entirely in per-image (`only`) mode: the candidate list was
    // already discovered, so re-scraping would burn credits on every image.
    let rescrape: string | null = null;
    if (!onlyUrls && (/yad2/.test(source) || /yad2\.co\.il/i.test(sourceUrl))) {
      try {
        const r = await userClient.functions.invoke("yad2-unlocker", {
          body: { url: sourceUrl, limit: 1 },
        });
        rescrape = r.error ? `yad2:${r.error.message}` : "yad2:ok";
      } catch (e) {
        rescrape = `yad2:${String((e as Error)?.message ?? e)}`;
      }
      listing = (await loadListing()) ?? listing;
    }

    // --- Step 2: gather every candidate URL we know about ---
    const candidates: string[] = [];
    if (onlyUrls) {
      candidates.push(...onlyUrls);
    } else {
      if (Array.isArray(listing.media_photos)) {
        for (const p of listing.media_photos as unknown[]) {
          if (isHttp(p)) candidates.push(p.trim());
          else if (p && typeof p === "object") harvestUrls(p, candidates);
        }
      }
      harvestUrls(listing.source_metadata, candidates);
    }

    const unique: string[] = [];
    const seen = new Set<string>();
    for (const raw of candidates) {
      const u = raw.trim();
      if (!isHttp(u) || isPlaceholder(u)) continue;
      const k = photoKey(u);
      if (seen.has(k)) continue;
      seen.add(k);
      unique.push(u);
      if (unique.length >= MAX_IMAGES) break;
    }

    // --- Discovery mode: return the candidate list, mirror nothing ---
    if (discover) {
      return json({
        ok: unique.length > 0,
        listing_id: listing.id,
        candidates: unique,
        count: unique.length,
        rescrape,
      });
    }


    // --- Step 3: mirror everything permanently into storage ---
    const referer = /yad2/.test(source) ? "https://www.yad2.co.il/" : (sourceUrl || SUPABASE_URL);
    const mirrored: string[] = [];
    const mirroredKeys = new Set<string>();
    let failed = 0;
    for (const u of unique) {
      const stored = await mirrorOne(admin, listing.id, u, referer);
      const finalUrl = stored ?? u;
      if (!stored) failed += 1;
      const k = photoKey(finalUrl);
      if (mirroredKeys.has(k)) continue;
      mirroredKeys.add(k);
      mirrored.push(finalUrl);
    }

    if (!mirrored.length) {
      return json({
        ok: false,
        reason: "no_images_found",
        listing_id: listing.id,
        photos: [],
        count: 0,
        rescrape,
      });
    }

    // --- Step 4: atomic DB update with the full unique gallery ---
    const prevMeta =
      listing.source_metadata && typeof listing.source_metadata === "object" && !Array.isArray(listing.source_metadata)
        ? (listing.source_metadata as Record<string, unknown>)
        : {};
    const { error: upErr } = await admin
      .from("listings")
      .update({
        media_photos: mirrored,
        source_metadata: {
          ...prevMeta,
          media_urls: mirrored,
          cached_media_urls: mirrored,
          media_photos_count: mirrored.length,
          media_photos_source: "manual_full_fetch",
          media_last_fetched_at: new Date().toISOString(),
        },
      })
      .eq("id", listing.id);
    if (upErr) return json({ error: upErr.message }, 500);

    console.log(
      `[fetch-property-all-images] listing=${listing.id} stored=${mirrored.length} failed=${failed} rescrape=${rescrape}`,
    );

    return json({
      ok: true,
      listing_id: listing.id,
      photos: mirrored,
      count: mirrored.length,
      failed,
      rescrape,
    });
  } catch (e) {
    console.error("[fetch-property-all-images]", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

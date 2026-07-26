// Mirrors social post images (Facebook CDN URLs that expire via `oe=`/`oh=`
// signatures) into the public `post-media-cache` storage bucket and re-links
// the campaign row so the feed keeps rendering long after the CDN link dies.
//
// POST { campaign_log_id: string, urls?: string[], force?: boolean }
// -> { cached: string[], media_urls: string[] }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "post-media-cache";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isHttp = (v: unknown): v is string =>
  typeof v === "string" && /^https?:\/\//i.test(v.trim());

const isVideo = (u: string) => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(u);

const mediaDedupeKey = (url: string): string => {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.toLowerCase();
  } catch {
    return url.split("?")[0].toLowerCase();
  }
};

const mergeUrls = (...values: unknown[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const items = Array.isArray(value) ? value : [];
    for (const item of items) {
      const url = typeof item === "string" ? item.trim() : "";
      if (!isHttp(url)) continue;
      const key = mediaDedupeKey(url);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(url);
    }
  }
  return out;
};

const keepLongest = (existing: unknown, incoming: unknown): string[] => {
  const existingUrls = mergeUrls(existing);
  const incomingUrls = mergeUrls(incoming);
  if (incomingUrls.length === 0) return existingUrls;
  if (existingUrls.length > 1 && incomingUrls.length <= 1) return existingUrls;
  return incomingUrls.length >= existingUrls.length ? incomingUrls : existingUrls;
};

// Stable key per remote asset: hash the path only (FB rotates query params on
// every fetch, so keying on the full URL would re-upload the same bytes).
async function storageKey(url: string): Promise<string> {
  let base = url;
  try {
    const u = new URL(url);
    base = `${u.hostname}${u.pathname}`;
  } catch { /* keep raw */ }
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(base));
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const ext = (base.match(/\.(jpe?g|png|webp|gif|mp4)$/i)?.[1] ?? "jpg").toLowerCase();
  return `posts/${hex}.${ext}`;
}

function publicUrl(path: string): string {
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function mirror(url: string): Promise<string | null> {
  if (!isHttp(url) || isVideo(url)) return null;
  if (url.includes(`/${BUCKET}/`)) return url; // already cached
  const path = await storageKey(url);

  // Skip the download when the object already exists in the bucket.
  const head = await fetch(publicUrl(path), { method: "HEAD" });
  if (head.ok) return publicUrl(path);

  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        Referer: "https://www.facebook.com/",
      },
    });
    if (!resp.ok) return null;
    const type = resp.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes.byteLength < 512) return null;
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: type,
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) {
      console.warn("[cache-post-media] upload failed", error.message);
      return null;
    }
    return publicUrl(path);
  } catch (e) {
    console.warn("[cache-post-media] fetch failed", String(e));
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const campaignLogId = typeof body?.campaign_log_id === "string" ? body.campaign_log_id : null;
    if (!campaignLogId) return json({ error: "campaign_log_id_required" }, 400);

    const { data: row, error } = await admin
      .from("campaign_logs")
      .select("id, media_urls, provider_response, listing_id")
      .eq("id", campaignLogId)
      .maybeSingle();
    if (error || !row) return json({ error: "campaign_log_not_found" }, 404);

    const pr: Record<string, unknown> = (row.provider_response as any) ?? {};
    const raw: any = (pr as any).raw ?? {};
    const candidates: string[] = [];
    const push = (v: unknown) => { if (isHttp(v) && !candidates.includes(v.trim())) candidates.push(v.trim()); };

    (Array.isArray(body?.urls) ? body.urls : []).forEach(push);
    (Array.isArray(row.media_urls) ? row.media_urls : []).forEach(push);
    (Array.isArray((pr as any).media_urls) ? (pr as any).media_urls : []).forEach(push);
    push(raw?.fullPicture);
    (Array.isArray(raw?.mediaUrls) ? raw.mediaUrls : []).forEach(push);

    // Last resort: fall back to the linked property's own photos so the card is
    // never blank when Facebook has rotated every CDN signature.
    if (candidates.length === 0 && row.listing_id) {
      const { data: listing } = await admin
        .from("listings")
        .select("media_photos")
        .eq("id", row.listing_id)
        .maybeSingle();
      (Array.isArray(listing?.media_photos) ? listing!.media_photos : []).forEach(push);
    }

    const cached: string[] = [];
    for (const url of candidates.slice(0, 8)) {
      const mirrored = await mirror(url);
      if (mirrored && !cached.includes(mirrored)) cached.push(mirrored);
    }

    if (cached.length === 0) return json({ cached: [], media_urls: candidates });

    const nextCached = keepLongest((pr as any).cached_media_urls, cached);
    const nextMedia = keepLongest(row.media_urls, nextCached);
    const nextProvider = { ...pr, cached_media_urls: nextCached, media_cached_at: new Date().toISOString() };
    if (!Array.isArray((pr as any).media_urls) || (pr as any).media_urls.length === 0) {
      (nextProvider as any).media_urls = candidates;
    }
    await admin
      .from("campaign_logs")
      .update({ media_urls: nextMedia, provider_response: nextProvider })
      .eq("id", campaignLogId);

    return json({ cached: nextCached, media_urls: nextMedia });
  } catch (e) {
    console.error("[cache-post-media] fatal", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

// Resolves an og:image (or first inline photo) for a Facebook / social post URL
// using Firecrawl, then permanently caches:
//   1. The image URL into campaign_logs.provider_response.media_urls
//   2. The binary image into the "post-media-cache" Supabase Storage bucket so
//      the front-end can render instantly even if the original FB CDN URL rotates.
//
// This is invoked from the front-end (fire-and-forget) whenever a rendered
// campaign card has no media_urls yet. A per-URL sentinel in localStorage
// prevents re-invocation for the same post — no spamming.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";


const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "post-media-cache";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureBucket() {
  try {
    const { data } = await admin.storage.getBucket(BUCKET);
    if (!data) await admin.storage.createBucket(BUCKET, { public: true });
  } catch {
    try { await admin.storage.createBucket(BUCKET, { public: true }); } catch { /* exists */ }
  }
}

function sanitizeUrl(url: string): string {
  // Strip tracking / query params and fragments — Firecrawl (and Ayrshare)
  // occasionally reject share URLs that carry oversized query strings (code 438).
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return url.split("?")[0].split("#")[0];
  }
}

async function firecrawlScrapeOnce(url: string): Promise<{ ok: boolean; status: number; errCode: number | null; errMsg: string; ogImage: string | null; images: string[] }> {
  if (!FIRECRAWL_API_KEY) return { ok: false, status: 0, errCode: null, errMsg: "no_api_key", ogImage: null, images: [] };
  const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["html"],
      onlyMainContent: false,
      waitFor: 1500,
      timeout: 25000,
    }),
  });
  const rawText = await resp.text().catch(() => "");
  if (!resp.ok) {
    // Try to extract provider error code (Ayrshare-style 438/331 or Firecrawl code fields)
    let errCode: number | null = null;
    let errMsg = rawText.slice(0, 500);
    try {
      const j = JSON.parse(rawText);
      errCode = Number(j?.code ?? j?.error_code ?? j?.status) || null;
      errMsg = j?.message || j?.error || errMsg;
    } catch { /* not JSON */ }
    console.warn(`[resolve-post-og-image] firecrawl failed HTTP=${resp.status} code=${errCode ?? "n/a"} msg=${errMsg}`);
    return { ok: false, status: resp.status, errCode, errMsg, ogImage: null, images: [] };
  }
  const json: any = JSON.parse(rawText || "{}");
  const md = json?.data?.metadata ?? {};
  const html: string = json?.data?.html ?? "";
  const ogImage: string | null = md.ogImage || md["og:image"] || md.image || null;
  const images: string[] = [];
  if (html) {
    const re = /<img[^>]+src=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && images.length < 6) {
      const u = m[1];
      if (/^https?:\/\//i.test(u) && /(fbcdn|scontent|akamai|cdninstagram)/i.test(u)) {
        if (!images.includes(u)) images.push(u);
      }
    }
  }
  return { ok: true, status: 200, errCode: null, errMsg: "", ogImage, images };
}

async function firecrawlScrape(url: string): Promise<{ ogImage: string | null; images: string[] }> {
  let attempt = await firecrawlScrapeOnce(url);
  if (attempt.ok) return { ogImage: attempt.ogImage, images: attempt.images };

  // 438 = rejected input → retry with a sanitized (stripped) URL.
  if (attempt.errCode === 438) {
    const clean = sanitizeUrl(url);
    if (clean !== url) {
      console.log(`[resolve-post-og-image] code=438 retrying with sanitized url=${clean}`);
      attempt = await firecrawlScrapeOnce(clean);
      if (attempt.ok) return { ogImage: attempt.ogImage, images: attempt.images };
    }
  }

  // 331 = provider-side processing failure → single backoff retry.
  if (attempt.errCode === 331 || attempt.status === 502 || attempt.status === 503 || attempt.status === 504) {
    console.log(`[resolve-post-og-image] code=${attempt.errCode ?? attempt.status} retrying after 1200ms`);
    await new Promise((r) => setTimeout(r, 1200));
    attempt = await firecrawlScrapeOnce(url);
    if (attempt.ok) return { ogImage: attempt.ogImage, images: attempt.images };
  }

  return { ogImage: null, images: [] };
}


async function mirrorToStorage(imageUrl: string, key: string): Promise<string | null> {
  try {
    const r = await fetch(imageUrl);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "image/jpeg";
    const buf = new Uint8Array(await r.arrayBuffer());
    const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
    const path = `${key}.${ext}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, buf, {
      contentType: ct,
      upsert: true,
    });
    if (error) { console.warn("[resolve-post-og-image] storage upload failed", error); return null; }
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl ?? null;
  } catch (err) {
    console.warn("[resolve-post-og-image] mirror error", err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const campaignLogId: string | null = body?.campaign_log_id ?? null;
    const postUrl: string | null = body?.post_url ?? null;
    const force: boolean = body?.force === true;
    if (!postUrl || typeof postUrl !== "string") {
      return new Response(JSON.stringify({ error: "post_url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await ensureBucket();

    // Fast path: if we already cached a mirrored URL for this post_url in
    // campaign_logs, return it without hitting Firecrawl again — unless
    // `force: true` was passed to bypass the cache.
    if (campaignLogId && !force) {

      const { data: existing } = await admin
        .from("campaign_logs")
        .select("provider_response")
        .eq("id", campaignLogId)
        .maybeSingle();
      const existingMedia = (existing as any)?.provider_response?.media_urls;
      if (Array.isArray(existingMedia) && existingMedia.length > 0) {
        return new Response(JSON.stringify({ ok: true, cached: true, media_urls: existingMedia }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const scraped = await firecrawlScrape(postUrl);
    const primary = scraped.ogImage || scraped.images[0] || null;
    if (!primary) {
      return new Response(JSON.stringify({ ok: false, error: "no_image_found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mirror every discovered image to persistent storage so subsequent
    // renders never depend on FB's short-lived CDN URLs.
    const urls: string[] = [];
    const uniq = Array.from(new Set([primary, ...scraped.images])).slice(0, 6);
    for (let i = 0; i < uniq.length; i++) {
      const key = `${(campaignLogId ?? "url")}_${i}_${Date.now()}`;
      const mirrored = await mirrorToStorage(uniq[i], key);
      urls.push(mirrored || uniq[i]);
    }

    if (campaignLogId) {
      const { data: row } = await admin
        .from("campaign_logs")
        .select("provider_response")
        .eq("id", campaignLogId)
        .maybeSingle();
      const pr = (row as any)?.provider_response ?? {};
      await admin
        .from("campaign_logs")
        .update({
          provider_response: {
            ...pr,
            media_urls: urls,
            og_image_source: "firecrawl",
            og_image_resolved_at: new Date().toISOString(),
          },
        })
        .eq("id", campaignLogId);
    }

    return new Response(JSON.stringify({ ok: true, cached: false, media_urls: urls }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[resolve-post-og-image] fatal", err);
    return new Response(JSON.stringify({ error: err?.message || "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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

async function firecrawlScrape(url: string): Promise<{ ogImage: string | null; images: string[] }> {
  if (!FIRECRAWL_API_KEY) return { ogImage: null, images: [] };
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
  if (!resp.ok) {
    console.warn("[resolve-post-og-image] firecrawl HTTP", resp.status, await resp.text().catch(() => ""));
    return { ogImage: null, images: [] };
  }
  const json: any = await resp.json().catch(() => ({}));
  const md = json?.data?.metadata ?? {};
  const html: string = json?.data?.html ?? "";
  const ogImage: string | null = md.ogImage || md["og:image"] || md.image || null;
  const images: string[] = [];
  // Fallback: pull first few <img src=...> from the HTML for carousel-style posts.
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
  return { ogImage, images };
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
    if (!postUrl || typeof postUrl !== "string") {
      return new Response(JSON.stringify({ error: "post_url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await ensureBucket();

    // Fast path: if we already cached a mirrored URL for this post_url in
    // campaign_logs, return it without hitting Firecrawl again.
    if (campaignLogId) {
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

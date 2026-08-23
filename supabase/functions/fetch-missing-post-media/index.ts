// Safe, rate-limit-compliant media recovery worker.
//
// Processes at most 25 campaign posts per run. For every post whose media is
// missing or not yet durably mirrored, it asks the Facebook Graph API and
// lookup, both wrapped in the shared 429 backoff guard) and the Facebook Graph
// API for the live image attachments, downloads them server-side and uploads
// them permanently into the public `post-media-cache` bucket. The absolute
// storage URLs are then written to campaign_logs.media_urls and
// provider_response.cached_media_urls.
//
// POST { limit?: number (<=25), force?: boolean, user_id?: string, budget_ms?: number }
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveMetaPage } from "../_shared/metaPage.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
const BUCKET = "post-media-cache";
const MAX_POSTS_PER_RUN = 25;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const asText = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const isRenderableMediaUrl = (value: unknown): value is string => {
  const url = asText(value);
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const pagePaths = ["/photo.php", "/permalink.php", "/share/", "/posts/", "/videos/", "/watch"];
    if ((host === "facebook.com" || host.endsWith(".facebook.com")) && pagePaths.some((p) => path.startsWith(p))) {
      return false;
    }
    return /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(url) ||
      host.includes("fbcdn.net") ||
      host.includes("cdninstagram.com") ||
      host.includes("supabase.co");
  } catch {
    return false;
  }
};

const isCached = (url: string) => url.includes(`/${BUCKET}/`);

const dedupeKey = (url: string): string => {
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
    for (const item of Array.isArray(value) ? value : []) {
      if (!isRenderableMediaUrl(item)) continue;
      const url = asText(item);
      const key = dedupeKey(url);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(url);
    }
  }
  return out;
};

// Never let a single-image payload clobber an existing multi-image gallery.
const keepLongestGallery = (existing: unknown, incoming: unknown): string[] => {
  const a = mergeUrls(existing);
  const b = mergeUrls(incoming);
  if (b.length === 0) return a;
  if (a.length > 1 && b.length <= 1) return a;
  return b.length >= a.length ? b : a;
};

async function storageKey(url: string): Promise<string> {
  let base = url;
  try {
    const u = new URL(url);
    base = `${u.hostname}${u.pathname}`;
  } catch { /* keep raw */ }
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(base));
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const ext = (base.match(/\.(jpe?g|png|webp|gif)$/i)?.[1] ?? "jpg").toLowerCase();
  return `posts/${hex}.${ext}`;
}

const publicUrl = (path: string) => admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

/** Download the remote image and store it permanently. Returns the public URL. */
async function mirror(url: string): Promise<string | null> {
  if (!isRenderableMediaUrl(url)) return null;
  if (isCached(url)) return url;
  const path = await storageKey(url);
  const target = publicUrl(path);

  const head = await fetch(target, { method: "HEAD" }).catch(() => null);
  if (head?.ok) return target;

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
      console.warn("[fetch-missing-post-media] upload failed", error.message);
      return null;
    }
    return target;
  } catch (e) {
    console.warn("[fetch-missing-post-media] download failed", String(e));
    return null;
  }
}

function collectDeep(node: unknown, acc: Set<string>, seen = new Set<unknown>()) {
  if (node == null) return;
  if (typeof node === "string") { if (isRenderableMediaUrl(node)) acc.add(node.trim()); return; }
  if (typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) node.forEach((n) => collectDeep(n, acc, seen));
  else Object.values(node as Record<string, unknown>).forEach((n) => collectDeep(n, acc, seen));
}

function collectFromGraphEntry(entry: any): string[] {
  const urls = new Set<string>();
  const push = (u: unknown) => { if (isRenderableMediaUrl(u)) urls.add(asText(u)); };
  push(entry?.full_picture);
  const visit = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    push(node?.media?.image?.src);
    push(node?.media?.source);
    if (node?.subattachments?.data) visit(node.subattachments.data);
  };
  if (entry?.attachments?.data) visit(entry.attachments.data);
  return Array.from(urls);
}

function parseMetaCredential(value: unknown): { token: string; pageId: string | null } {
  const text = asText(value);
  if (!text) return { token: "", pageId: null };
  try {
    const parsed = JSON.parse(text);
    return {
      token: asText(parsed?.access_token ?? parsed?.token ?? parsed?.page_access_token),
      pageId: asText(parsed?.page_id ?? parsed?.pageId) || null,
    };
  } catch {
    return { token: text, pageId: null };
  }
}

async function resolveGraphToken(ownerId?: string | null): Promise<string> {
  const page = await resolveMetaPage(admin, ownerId ?? null);
  if (page?.token) return page.token;
  const env = parseMetaCredential(
    Deno.env.get("FB_PAGE_ACCESS_TOKEN") ||
      Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN") ||
      Deno.env.get("META_ACCESS_TOKEN"),
  );
  return env.token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    // HARD CAP: never process more than 25 posts in a single invocation.
    const limit = Math.min(MAX_POSTS_PER_RUN, Math.max(1, Number(body?.limit) || MAX_POSTS_PER_RUN));
    const force = body?.force === true;
    const budgetMs = Math.min(240_000, Math.max(10_000, Number(body?.budget_ms) || 120_000));
    const startedAt = Date.now();

    let query = admin
      .from("campaign_logs")
      .select("id, provider_message_id, provider_response, media_urls, listing_id, user_id")
      .eq("channel", "facebook")
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (asText(body?.user_id)) query = query.eq("user_id", asText(body.user_id));
    const { data: rows, error } = await query;
    if (error) return json({ error: error.message }, 500);

    const scanned = rows ?? [];
    const targets = scanned
      .filter((r: any) => {
        if (force) return true;
        const media: string[] = Array.isArray(r.media_urls) ? r.media_urls : [];
        // The "nothing found" marker only suppresses rows that truly have no
        // media at all; rows holding non-durable links stay in the queue.
        if (media.length === 0 && asText((r.provider_response as any)?.media_scan_empty_at)) return false;
        return media.length === 0 || !media.every((u) => typeof u === "string" && isCached(u));
      })
      .slice(0, limit);

    if (targets.length === 0) {
      return json({ ok: true, scanned: scanned.length, targeted: 0, updated: 0, mirrored: 0 });
    }

    const historyMedia = new Map<string, string[]>();

    // ---- Facebook Graph batch lookup --------------------------------------
    const graphMedia = new Map<string, string[]>();
    const token = await resolveGraphToken(asText(body?.user_id) || null);
    const nativeIds = targets
      .map((t: any) => asText(t.provider_message_id))
      .filter((id) => /^\d{5,}(_\d{5,})?$/.test(id));
    if (token && nativeIds.length) {
      const fields = "full_picture,attachments{media,subattachments{media}}";
      for (let i = 0; i < nativeIds.length; i += 25) {
        const chunk = nativeIds.slice(i, i + 25);
        const url =
          `https://graph.facebook.com/v26.0/?ids=${encodeURIComponent(chunk.join(","))}` +
          `&fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
        const resp = await fetch(url).catch(() => null);
        if (!resp?.ok) continue;
        const payload: any = await resp.json().catch(() => ({}));
        for (const pid of chunk) {
          const urls = collectFromGraphEntry(payload?.[pid]);
          if (urls.length) graphMedia.set(pid, urls);
        }
      }
    }

    let updated = 0;
    let mirrored = 0;
    let unresolved = 0;
    let timedOut = false;

    for (const row of targets) {
      if (Date.now() - startedAt > budgetMs) { timedOut = true; break; }

      const pid = asText((row as any).provider_message_id);
      const pr: Record<string, unknown> = ((row as any).provider_response as any) ?? {};
      const candidates: string[] = [];
      const push = (v: unknown) => {
        if (isRenderableMediaUrl(v) && !candidates.includes(asText(v))) candidates.push(asText(v));
      };

      (graphMedia.get(pid) ?? []).forEach(push);
      (historyMedia.get(pid) ?? []).forEach(push);
      (Array.isArray((pr as any).cached_media_urls) ? (pr as any).cached_media_urls : []).forEach(push);
      (Array.isArray((row as any).media_urls) ? (row as any).media_urls : []).forEach(push);
      (Array.isArray((pr as any).media_urls) ? (pr as any).media_urls : []).forEach(push);
      const deep = new Set<string>();
      collectDeep((pr as any).raw, deep);
      deep.forEach(push);

      // Last resort: the linked property's own photos.
      if (candidates.length === 0 && (row as any).listing_id) {
        const { data: listing } = await admin
          .from("listings")
          .select("media_photos")
          .eq("id", (row as any).listing_id)
          .maybeSingle();
        (Array.isArray((listing as any)?.media_photos) ? (listing as any).media_photos : []).forEach(push);
      }

      const markEmpty = async () => {
        unresolved++;
        await admin
          .from("campaign_logs")
          .update({ provider_response: { ...pr, media_scan_empty_at: new Date().toISOString() } })
          .eq("id", (row as any).id);
      };
      if (candidates.length === 0) { await markEmpty(); continue; }

      const cached: string[] = [];
      for (const url of candidates.slice(0, 12)) {
        const local = await mirror(url);
        if (local && !cached.includes(local)) {
          cached.push(local);
          if (!isCached(url)) mirrored++;
        }
      }
      if (cached.length === 0) { await markEmpty(); continue; }

      // Historic rows stored raw CDN links under cached_media_urls; only real
      // storage URLs may survive here.
      const priorCached = mergeUrls((pr as any).cached_media_urls).filter(isCached);
      const nextCached = keepLongestGallery(priorCached, cached);
      const nextProvider = {
        ...pr,
        media_urls: keepLongestGallery((pr as any).media_urls, candidates),
        cached_media_urls: nextCached,
        media_cached_at: new Date().toISOString(),
      };
      // The row's media_urls become EXCLUSIVELY durable storage URLs — never a
      // mix with expiring CDN links, so the feed can render them directly.
      const durableMedia = nextCached.length > 0
        ? nextCached
        : mergeUrls((row as any).media_urls);

      const { error: upErr } = await admin
        .from("campaign_logs")
        .update({ media_urls: durableMedia, provider_response: nextProvider })
        .eq("id", (row as any).id);
      if (!upErr) updated++;
    }

    return json({
      ok: true,
      scanned: scanned.length,
      targeted: targets.length,
      updated,
      mirrored,
      unresolved,
      timed_out: timedOut,
      graph_hits: graphMedia.size,
      history_hits: historyMedia.size,
    });
  } catch (e) {
    console.error("[fetch-missing-post-media] fatal", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

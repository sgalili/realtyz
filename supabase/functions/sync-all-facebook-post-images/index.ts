// Bulk media re-sync for every stored Facebook campaign post.
//
// 1. Pulls active full-resolution media for each post from the Facebook Graph
//    API (batched) and, as a fallback, from the Ayrshare history endpoint.
// 2. Permanently mirrors every image into the public `post-media-cache` bucket.
// 3. Rewrites campaign_logs.media_urls (+ provider_response.cached_media_urls)
//    so the feed never depends on an expiring CDN signature again.
//
// POST { limit?: number, force?: boolean, user_id?: string }
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AYR_BASE = "https://api.ayrshare.com/api";
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
const BUCKET = "post-media-cache";

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
      if (!isRenderableMediaUrl(item)) continue;
      const url = asText(item);
      const key = mediaDedupeKey(url);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(url);
    }
  }
  return out;
};

const keepLongestGallery = (existing: unknown, incoming: unknown): string[] => {
  const existingUrls = mergeUrls(existing);
  const incomingUrls = mergeUrls(incoming);
  if (incomingUrls.length === 0) return existingUrls;
  if (existingUrls.length > 1 && incomingUrls.length <= 1) return existingUrls;
  return incomingUrls.length >= existingUrls.length ? incomingUrls : existingUrls;
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

async function mirror(url: string): Promise<string | null> {
  if (!isRenderableMediaUrl(url)) return null;
  if (isCached(url)) return url;
  const path = await storageKey(url);
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
    if (error) return null;
    return publicUrl(path);
  } catch {
    return null;
  }
}

function parseMetaCredential(raw: unknown): { token: string; pageId: string | null } {
  const text = asText(raw);
  if (!text) return { token: "", pageId: null };
  try {
    const parsed = JSON.parse(text);
    return {
      token: asText(parsed?.access_token ?? parsed?.token ?? parsed?.page_token),
      pageId: asText(parsed?.page_id ?? parsed?.pageId) || null,
    };
  } catch {
    return { token: text, pageId: null };
  }
}

async function resolveGraphToken(pageIdHint: string | null): Promise<{ token: string; pageId: string | null }> {
  const env = parseMetaCredential(
    Deno.env.get("FB_PAGE_ACCESS_TOKEN") ||
      Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN") ||
      Deno.env.get("META_ACCESS_TOKEN"),
  );
  if (env.token) return { token: env.token, pageId: env.pageId || pageIdHint };
  const { data: rows } = await admin
    .from("api_configs")
    .select("api_key, service_name")
    .in("service_name", ["Meta Marketing API", "Facebook Graph API", "Facebook Page Access Token"])
    .eq("is_active", true)
    .limit(5);
  for (const row of rows ?? []) {
    const parsed = parseMetaCredential((row as any)?.api_key);
    if (parsed.token) return { token: parsed.token, pageId: parsed.pageId || pageIdHint };
  }
  return { token: "", pageId: pageIdHint };
}

function collectFromGraphEntry(entry: any): string[] {
  const urls: string[] = [];
  const push = (u: unknown) => {
    if (isRenderableMediaUrl(u) && !urls.includes(asText(u))) urls.push(asText(u));
  };
  push(entry?.full_picture);
  const visit = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    push(node?.media?.image?.src);
    push(node?.media?.source);
    if (node?.subattachments?.data) visit(node.subattachments.data);
  };
  if (entry?.attachments?.data) visit(entry.attachments.data);
  return urls;
}

function collectDeep(node: any, acc: Set<string>, seen = new Set<any>()) {
  if (node == null) return;
  if (typeof node === "string") { if (isRenderableMediaUrl(node)) acc.add(node.trim()); return; }
  if (typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) node.forEach((n) => collectDeep(n, acc, seen));
  else Object.values(node).forEach((n) => collectDeep(n, acc, seen));
}

async function ayrshareHistoryMap(): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const apiKey = Deno.env.get("AYRSHARE_API_KEY")?.trim();
  if (!apiKey) return map;
  const { data: ws } = await admin
    .from("workspace_social_profile")
    .select("ayrshare_profile_key")
    .eq("id", WORKSPACE_ID)
    .maybeSingle();
  const profileKey = asText((ws as any)?.ayrshare_profile_key);
  if (!profileKey) return map;
  try {
    const res = await fetch(`${AYR_BASE}/history/facebook?lastDays=0&limit=500`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Profile-Key": profileKey },
    });
    if (!res.ok) return map;
    const payload: any = await res.json().catch(() => ({}));
    const items: any[] = Array.isArray(payload) ? payload : (payload?.posts || payload?.history || payload?.data || []);
    for (const item of items) {
      const ids = [item?.id, item?.postId, item?.fbId, item?.post_id]
        .map((v) => asText(v)).filter(Boolean);
      const urls = new Set<string>();
      collectDeep(item, urls);
      if (!urls.size) continue;
      for (const id of ids) map.set(id, Array.from(urls));
    }
  } catch { /* fallback only */ }
  return map;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(1000, Math.max(1, Number(body?.limit) || 500));
    const force = body?.force === true;

    const { data: ws } = await admin
      .from("workspace_social_profile")
      .select("facebook_page_id")
      .eq("id", WORKSPACE_ID)
      .maybeSingle();
    const pageIdHint = asText((ws as any)?.facebook_page_id) || null;

    let query = admin
      .from("campaign_logs")
      .select("id, provider_message_id, provider_response, media_urls, listing_id, user_id")
      .eq("channel", "facebook")
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (asText(body?.user_id)) query = query.eq("user_id", asText(body.user_id));
    const { data: rows, error } = await query;
    if (error) return json({ error: error.message }, 500);

    const posts = rows ?? [];
    // Skip rows already fully mirrored unless force=true.
    const targets = posts.filter((r: any) => {
      if (force) return true;
      // Skip rows a previous run already scanned and found no media for, so a
      // re-invocation always makes forward progress through the backlog.
      if (asText((r.provider_response as any)?.media_scan_empty_at)) return false;
      const media: string[] = Array.isArray(r.media_urls) ? r.media_urls : [];
      return media.length === 0 || !media.every((u) => typeof u === "string" && isCached(u));
    });


    // ---- Graph batch fetch -------------------------------------------------
    const graphMedia = new Map<string, string[]>();
    const { token } = await resolveGraphToken(pageIdHint);
    const nativeTargets = targets.filter((t: any) => /^\d{5,}(_\d{5,})?$/.test(asText(t.provider_message_id)));
    if (token && nativeTargets.length) {
      const fields = "full_picture,attachments{media,subattachments{media}}";
      for (let i = 0; i < nativeTargets.length; i += 40) {
        const chunk = nativeTargets.slice(i, i + 40);
        const ids = chunk.map((t: any) => asText(t.provider_message_id)).join(",");
        const url =
          `https://graph.facebook.com/v20.0/?ids=${encodeURIComponent(ids)}&fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const payload: any = await resp.json().catch(() => ({}));
        for (const t of chunk) {
          const pid = asText((t as any).provider_message_id);
          const urls = collectFromGraphEntry(payload?.[pid]);
          if (urls.length) graphMedia.set(pid, urls);
        }
      }
    }

    // ---- Ayrshare history fallback ----------------------------------------
    const historyMedia = graphMedia.size < targets.length ? await ayrshareHistoryMap() : new Map<string, string[]>();

    let updated = 0;
    let mirrored = 0;
    let unresolved = 0;
    // Wall-clock budget so a large backlog never trips the edge timeout — the
    // caller simply re-invokes and picks up where this run stopped.
    const startedAt = Date.now();
    const budgetMs = Math.min(240_000, Math.max(10_000, Number(body?.budget_ms) || 120_000));
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
      (Array.isArray((row as any).media_urls) ? (row as any).media_urls : []).forEach(push);
      (Array.isArray((pr as any).media_urls) ? (pr as any).media_urls : []).forEach(push);
      (Array.isArray((pr as any).cached_media_urls) ? (pr as any).cached_media_urls : []).forEach(push);
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
      for (const url of candidates.slice(0, 8)) {
        const local = await mirror(url);
        if (local && !cached.includes(local)) {
          cached.push(local);
          if (!isCached(url)) mirrored++;
        }
      }
      if (cached.length === 0) { await markEmpty(); continue; }

      const nextProvider = {
        ...pr,
        media_urls: keepLongestGallery((pr as any).media_urls, candidates),
        cached_media_urls: keepLongestGallery((pr as any).cached_media_urls, cached),
        media_cached_at: new Date().toISOString(),
      };
      const durableMedia = keepLongestGallery(
        (row as any).media_urls,
        mergeUrls((nextProvider as any).cached_media_urls, nextProvider.media_urls),
      );
      const { error: upErr } = await admin
        .from("campaign_logs")
        .update({ media_urls: durableMedia, provider_response: nextProvider })
        .eq("id", (row as any).id);
      if (!upErr) updated++;
    }

    return json({
      ok: true,
      scanned: posts.length,
      targeted: targets.length,
      updated,
      mirrored,
      unresolved,
      timed_out: timedOut,

      graph_hits: graphMedia.size,
      history_hits: historyMedia.size,
    });
  } catch (e) {
    console.error("[sync-all-facebook-post-images] fatal", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

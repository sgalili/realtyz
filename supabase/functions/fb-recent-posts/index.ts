// Fetch Facebook Page posts via Ayrshare's platform history endpoint and persist
// every native Page post into campaign_logs. The browser feed must never depend
// on transient Ayrshare pages; campaign_logs is the permanent source of truth.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_OWNER_ID = "8f66ac1a-070a-4485-ac3b-07697d6c4b9e";
const AYR_BASE = "https://api.ayrshare.com/api";

const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const firstValidDate = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (!value) continue;
    const d = new Date(String(value));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
};

const addUrl = (set: Set<string>, value: unknown) => {
  const url = asText(value);
  if (/^https?:\/\//i.test(url)) set.add(url);
};

const collectMediaUrls = (it: any): string[] => {
  const urls = new Set<string>();
  addUrl(urls, it?.fullPicture);
  addUrl(urls, it?.picture);
  addUrl(urls, it?.imageUrl);
  addUrl(urls, it?.thumbnailUrl);
  addUrl(urls, it?.coverImageUrl);
  addUrl(urls, it?.mediaUrl);

  const visitMedia = (node: any) => {
    if (!node) return;
    if (typeof node === "string") {
      addUrl(urls, node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visitMedia);
      return;
    }
    if (typeof node !== "object") return;
    addUrl(urls, node.mediaUrl);
    addUrl(urls, node.src);
    addUrl(urls, node.url);
    addUrl(urls, node.href);
    addUrl(urls, node.thumbnailUrl);
    addUrl(urls, node.fullPicture);
    addUrl(urls, node.coverImageUrl);
    addUrl(urls, node.media?.image?.src);
    addUrl(urls, node.media?.source);
    addUrl(urls, node.image?.src);
  };

  visitMedia(it?.mediaUrls);
  visitMedia(it?.media);
  visitMedia(it?.attachments);
  return Array.from(urls);
};

const collectPostIds = (it: any, includeDirectId = true): string[] => {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    const v = asText(value);
    if (v) ids.add(v);
  };
  if (includeDirectId) add(it?.id);
  add(it?.fbId);
  add(it?.postId);
  add(it?.post_id);
  add(it?.platforms?.facebook?.id);
  add(it?.postIds?.facebook);
  const postIds = Array.isArray(it?.postIds) ? it.postIds : [];
  for (const p of postIds) {
    const platform = asText(p?.platform).toLowerCase();
    if (!platform || platform === "facebook") add(p?.id ?? p?.postId ?? p?.post_id);
  }
  return Array.from(ids);
};

type RawPost = { item: any; source: "platform" | "generic"; profileKey?: string; refId?: string | null; fbId?: string | null; fbName?: string | null };
type ProfileCandidate = { profileKey: string; refId: string | null; fbId: string | null; fbName: string | null; label: string };

const pickNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
      return Math.max(0, Math.trunc(Number(value)));
    }
  }
  return null;
};

const reactionTotal = (value: any): number | null => {
  if (value == null) return null;
  if (typeof value === "number") return Math.max(0, Math.trunc(value));
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Math.max(0, Math.trunc(Number(value)));
  if (Array.isArray(value)) {
    const total = value.reduce((sum, item) => sum + (pickNumber(item?.count, item?.total, item?.value, item) ?? 0), 0);
    return total > 0 ? total : null;
  }
  if (typeof value === "object") {
    const direct = pickNumber(value.total, value.total_count, value.count, value.summary?.total_count);
    if (direct !== null) return direct;
    let total = 0;
    for (const [key, nested] of Object.entries(value)) {
      if (key === "summary" || key === "viewer_reaction") continue;
      total += reactionTotal(nested) ?? 0;
    }
    return total > 0 ? total : null;
  }
  return null;
};

const normalizePost = (raw: RawPost) => {
  const it = raw.item;
  if (String(it?.status || "").toLowerCase() === "error") return null;
  if (Array.isArray(it?.errors) && it.errors.length > 0) return null;

  const ids = collectPostIds(it, raw.source === "platform");
  const primaryId = ids[0] || null;
  if (!primaryId) return null;
  const text = String(it.post || it.message || it.text || it.caption || it.description || "");
  const createdAt = firstValidDate(
    it.created, it.createdAt, it.created_time, it.createdTime,
    it.publishedAt, it.published_at, it.scheduleDate, it.scheduledFor,
    it.lastUpdated, it.updated, it.updatedAt, it.timestamp,
    it.platforms?.facebook?.created, it.platforms?.facebook?.createdTime,
    it.platforms?.facebook?.publishedAt, it.platforms?.facebook?.created_time,
  ) ?? new Date().toISOString();
  const media = collectMediaUrls(it);
  const url = it.postUrl || it.permalink_url || it.platforms?.facebook?.postUrl || null;
  return {
    id: primaryId,
    fb_post_id: primaryId,
    post_ids: ids,
    text,
    created_at: createdAt,
    status: it.status || it.statusType || it.platforms?.facebook?.status || null,
    url,
    media,
    like_count: reactionTotal(it.reactions) ?? pickNumber(it.likeCount, it.likes, it.reactionsCount, it.reactionsByType),
    comment_count: pickNumber(it.commentsCount, it.commentCount, it.comments, it.totalFirstLevelComments),
    share_count: pickNumber(it.shareCount, it.shares, it.sharesCount),
    view_count: pickNumber(it.impressionsUnique, it.impressionCount, it.impressions, it.videoViews, it.viewCount),
    _profile_key: raw.profileKey ?? null,
    _profile_ref_id: raw.refId ?? null,
    _profile_fb_id: raw.fbId ?? null,
    _profile_fb_name: raw.fbName ?? null,
    _raw_keys: Object.keys(it || {}),
    _raw: it,
  };
};

const titleFromText = (text: string) => (text.trim().split("\n")[0] || "פוסט פייסבוק").slice(0, 120);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let body: any = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { body = {}; }
    }
    const lastRecords = Math.min(500, Math.max(1, Number(body?.lastRecords ?? url.searchParams.get("lastRecords") ?? "500")));
    const pageSize = Math.min(100, Math.max(10, Number(body?.pageSize ?? url.searchParams.get("pageSize") ?? 100)));
    const maxPages = Math.max(1, Math.ceil(lastRecords / pageSize));
    const since = asText(body?.since ?? url.searchParams.get("since"));
    const until = asText(body?.until ?? url.searchParams.get("until"));
    const persist = body?.persist !== false && url.searchParams.get("persist") !== "false";
    const ownerId = asText(body?.user_id ?? body?.owner_id ?? url.searchParams.get("user_id")) || DEFAULT_OWNER_ID;

    const KEY = Deno.env.get("AYRSHARE_API_KEY")?.trim().replace(/^["']|["']$/g, "");
    if (!KEY) throw new Error("AYRSHARE_API_KEY missing");

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: ws } = await admin
      .from("workspace_social_profile")
      .select("ayrshare_profile_key, facebook_page_id, facebook_page_name")
      .eq("id", WORKSPACE_ID)
      .maybeSingle();
    const profileKey = (ws?.ayrshare_profile_key?.toString().trim()) ||
      Deno.env.get("AYRSHARE_PROFILE_KEY")?.trim().replace(/^["']|["']$/g, "") || "";
    if (!profileKey) throw new Error("workspace ayrshare_profile_key missing");

    const discoverProfiles = async (): Promise<ProfileCandidate[]> => {
      const candidates: ProfileCandidate[] = [];
      const seen = new Set<string>();
      const push = (c: ProfileCandidate) => {
        if (!c.profileKey || seen.has(c.profileKey)) return;
        seen.add(c.profileKey);
        candidates.push(c);
      };

      push({
        profileKey,
        refId: null,
        fbId: ws?.facebook_page_id ?? null,
        fbName: ws?.facebook_page_name ?? null,
        label: "workspace",
      });

      try {
        const listRes = await fetch(`${AYR_BASE}/profiles`, { headers: { Authorization: `Bearer ${KEY}` } });
        const listJson = await listRes.json().catch(() => ({} as any));
        const profiles: any[] = Array.isArray(listJson?.profiles) ? listJson.profiles : Array.isArray(listJson) ? listJson : [];
        for (const p of profiles.slice(0, 50)) {
          const pk = asText(p?.profileKey);
          if (!pk) continue;
          try {
            const userRes = await fetch(`${AYR_BASE}/user`, {
              headers: { Authorization: `Bearer ${KEY}`, "Profile-Key": pk },
            });
            const userJson = await userRes.json().catch(() => ({} as any));
            if (!userRes.ok) continue;
            const active = Array.isArray(userJson?.activeSocialAccounts)
              ? userJson.activeSocialAccounts.map((v: any) => String(v || "").toLowerCase())
              : [];
            const displayNames = Array.isArray(userJson?.displayNames) ? userJson.displayNames : [];
            const fb = displayNames.find((a: any) => String(a?.platform || "").toLowerCase() === "facebook");
            const hasFacebook = active.includes("facebook") || !!fb;
            if (!hasFacebook) continue;
            const fbId = asText(fb?.id ?? fb?.pageId) || null;
            const fbName = asText(fb?.displayName ?? fb?.username ?? fb?.name) || null;
            push({ profileKey: pk, refId: asText(p?.refId) || null, fbId, fbName, label: asText(p?.title) || "profile" });
          } catch (_profileErr) {
            // Keep scanning other profiles. One suspended profile must not stop the import.
          }
        }
      } catch (profileListErr) {
        console.warn("[fb-recent-posts] profile discovery failed", profileListErr);
      }

      const targetFbId = asText(ws?.facebook_page_id);
      return candidates.sort((a, b) => {
        const aMatch = targetFbId && a.fbId === targetFbId ? 0 : 1;
        const bMatch = targetFbId && b.fbId === targetFbId ? 0 : 1;
        return aMatch - bMatch;
      });
    };

    const fetchPlatformHistory = async (candidate: ProfileCandidate | null): Promise<{ posts: RawPost[]; status: number; error: any }> => {
      const seenIds = new Set<string>();
      const rows: RawPost[] = [];
      let status = 0;
      let error: any = null;
      let nextCursor: string | null = null;

      for (let page = 0; page < maxPages; page++) {
        const qs = new URLSearchParams({
          limit: String(pageSize),
          dataType: "posts",
          pagePublished: "true",
        });
        if (since) qs.set("since", since);
        if (until) qs.set("until", until);
        if (nextCursor) qs.set("next", nextCursor);
        const headers: Record<string, string> = { Authorization: `Bearer ${KEY}` };
        if (candidate?.profileKey) headers["Profile-Key"] = candidate.profileKey;
        const resp = await fetch(`${AYR_BASE}/history/facebook?${qs.toString()}`, { headers });
        status = resp.status;
        const json = await resp.json().catch(() => ({} as any));
        if (!resp.ok) { error = json; break; }
        const items: any[] = Array.isArray(json) ? json : (json.posts || json.history || json.data || []);
        if (!items.length) break;
        let added = 0;
        for (const it of items) {
          if (String(it?.status || "").toLowerCase() === "error" || (Array.isArray(it?.errors) && it.errors.length > 0)) continue;
          const ids = collectPostIds(it, true);
          const id = ids[0] || JSON.stringify(it).slice(0, 96);
          if (seenIds.has(id)) continue;
          seenIds.add(id);
          rows.push({
            item: it,
            source: "platform",
            profileKey: candidate?.profileKey,
            refId: candidate?.refId ?? null,
            fbId: candidate?.fbId ?? null,
            fbName: candidate?.fbName ?? null,
          });
          added++;
        }
        nextCursor = json?.meta?.pagination?.next || json?.next || json?.nextToken || json?.next_token || json?.pageToken || null;
        const hasMore = Boolean(json?.meta?.pagination?.hasMore || nextCursor);
        if (!hasMore && added === 0) break;
        if (!hasMore) break;
        if (rows.length >= lastRecords) break;
      }

      return { posts: rows, status, error };
    };

    const fetchGenericHistory = async (): Promise<{ posts: RawPost[]; status: number; error: any }> => {
      const genericQs = new URLSearchParams({
        platforms: "facebook",
        lastRecords: String(lastRecords),
        pagePublished: "true",
      });
      const resp = await fetch(`${AYR_BASE}/history?${genericQs.toString()}`, {
        headers: { Authorization: `Bearer ${KEY}`, "Profile-Key": profileKey },
      });
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok) return { posts: [], status: resp.status, error: json };
      const items: any[] = Array.isArray(json) ? json : (json.posts || json.history || json.data || []);
      const seenIds = new Set<string>();
      const rows: RawPost[] = [];
      for (const it of items) {
        if (String(it?.status || "").toLowerCase() === "error" || (Array.isArray(it?.errors) && it.errors.length > 0)) continue;
        const ids = collectPostIds(it, false);
        const id = ids[0];
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        rows.push({ item: it, source: "generic", profileKey });
      }
      return { posts: rows, status: resp.status, error: null };
    };

    const candidates = await discoverProfiles();
    let all: RawPost[] = [];
    let lastStatus = 0;
    let lastError: any = null;
    let winningProfile: ProfileCandidate | null = null;

    for (const candidate of candidates) {
      const result = await fetchPlatformHistory(candidate);
      lastStatus = result.status;
      lastError = result.error;
      if (result.posts.length > all.length) {
        all = result.posts;
        winningProfile = candidate;
      }
      if (result.posts.length >= Math.min(50, lastRecords)) break;
    }

    if (all.length === 0) {
      const accountResult = await fetchPlatformHistory(null);
      lastStatus = accountResult.status;
      lastError = accountResult.error;
      all = accountResult.posts;
      winningProfile = null;
    }

    if (all.length === 0) {
      const genericResult = await fetchGenericHistory();
      lastStatus = genericResult.status;
      lastError = genericResult.error;
      all = genericResult.posts;
    }

    if (winningProfile?.profileKey && winningProfile.profileKey !== profileKey) {
      await admin
        .from("workspace_social_profile")
        .update({
          ayrshare_profile_key: winningProfile.profileKey,
          ayrshare_ref_id: winningProfile.refId,
          facebook_page_id: winningProfile.fbId ?? ws?.facebook_page_id ?? null,
          facebook_page_name: winningProfile.fbName ?? ws?.facebook_page_name ?? null,
          connected_platforms: ["facebook"],
          updated_at: new Date().toISOString(),
        })
        .eq("id", WORKSPACE_ID);
    }

    const posts = all.slice(0, lastRecords).map(normalizePost).filter((p): p is NonNullable<ReturnType<typeof normalizePost>> => !!p);

    let upserted = 0;
    let persistError: string | null = null;
    if (persist && posts.length > 0) {
      const rows = posts
        .filter((p) => p.fb_post_id)
        .map((p) => ({
          user_id: ownerId,
          campaign_name: titleFromText(p.text),
          channel: "facebook",
          message_body: p.text || titleFromText(p.text),
          created_at: p.created_at,
          sent_at: p.created_at,
          status: "sent",
          is_archived: false,
          provider_message_id: String(p.fb_post_id),
          provider_response: {
            imported_native_facebook: true,
            imported_at: new Date().toISOString(),
            ayrshare_profile_ref_id: p._profile_ref_id,
            facebook_page_id: ws?.facebook_page_id ?? null,
            facebook_page_name: ws?.facebook_page_name ?? null,
            postIds: p.post_ids.map((id: string) => ({ platform: "facebook", id, postUrl: p.url || null })),
            media_urls: p.media,
            external_url: p.url,
            native_status: p.status,
            raw_keys: p._raw_keys,
            raw: p._raw,
          },
          like_count: p.like_count ?? 0,
          comment_count: p.comment_count ?? 0,
          share_count: p.share_count ?? 0,
          view_count: p.view_count ?? 0,
          metrics_updated_at: new Date().toISOString(),
        }));

      if (rows.length > 0) {
        const { data, error } = await admin
          .from("campaign_logs")
          .upsert(rows, { onConflict: "user_id,provider_message_id" })
          .select("id");
        if (error) persistError = error.message;
        else upserted = data?.length ?? rows.length;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, count: posts.length, posts, persisted: persist, upserted, persist_error: persistError, owner_id: ownerId, raw_status: lastStatus, raw_error: lastError }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
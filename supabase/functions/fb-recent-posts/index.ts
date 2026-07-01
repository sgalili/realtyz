// Fetch Facebook Page posts via Ayrshare's platform history endpoint and persist
// every native Page post into campaign_logs. The browser feed must never depend
// on transient Ayrshare pages; campaign_logs is the permanent source of truth.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_OWNER_ID = "8f66ac1a-070a-4485-ac3b-07697d6c4b9e";
const AYR_BASE = "https://api.ayrshare.com/api";
const MIN_SAFE_PURGE_POSTS = 50;
const PROVIDER_COOLDOWN_MINUTES = 15;

const asText = (
  value: unknown,
) => (typeof value === "string" ? value.trim() : "");

const coerceDateValue = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const nested = coerceDateValue(
      obj.utc ?? obj.iso ?? obj.date ?? obj.created_time ?? obj.createdAt,
    );
    if (nested) return nested;
    const seconds = typeof obj._seconds === "number"
      ? obj._seconds
      : typeof obj.seconds === "number"
      ? obj.seconds
      : null;
    if (seconds !== null) {
      const d = new Date(seconds * 1000);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return null;
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const firstValidDate = (...values: unknown[]): string | null => {
  for (const value of values) {
    const parsed = coerceDateValue(value);
    if (parsed) return parsed;
  }
  return null;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const addUrl = (set: Set<string>, value: unknown) => {
  const url = asText(value);
  if (/^https?:\/\//i.test(url)) set.add(url);
};

const collectMediaUrls = (it: any): string[] => {
  const urls = new Set<string>();
  addUrl(urls, it?.fullPicture);
  addUrl(urls, it?.full_picture);
  addUrl(urls, it?.picture);
  addUrl(urls, it?.imageUrl);
  addUrl(urls, it?.thumbnailUrl);
  addUrl(urls, it?.coverImageUrl);
  addUrl(urls, it?.mediaUrl);
  addUrl(urls, it?.source);

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
    addUrl(urls, node.full_picture);
    addUrl(urls, node.permalink_url);
    visitMedia(node.data);
    visitMedia(node.attachments);
    visitMedia(node.subattachments);
  };

  visitMedia(it?.mediaUrls);
  visitMedia(it?.media);
  visitMedia(it?.attachments);
  visitMedia(it?.subattachments);
  visitMedia(it?.attachments?.data);
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
    if (!platform || platform === "facebook") {
      add(p?.id ?? p?.postId ?? p?.post_id);
    }
  }
  return Array.from(ids);
};

const looksLikeNativeFacebookPostId = (value: unknown) => {
  const v = asText(value);
  // Native Facebook page posts commonly arrive as PAGEID_POSTID. Keep this
  // broad enough for Meta variants while excluding Ayrshare history UUIDs/ids.
  return /^\d{5,}(_\d{5,})?$/.test(v);
};

const pickNativeFacebookPostId = (it: any): string | null => {
  const candidates: unknown[] = [
    it?.fbId,
    it?.postId,
    it?.post_id,
    it?.platforms?.facebook?.id,
    it?.postIds?.facebook,
  ];
  const postIds = Array.isArray(it?.postIds) ? it.postIds : [];
  for (const p of postIds) {
    const platform = asText(p?.platform).toLowerCase();
    if (!platform || platform === "facebook") {
      candidates.push(p?.id ?? p?.postId ?? p?.post_id);
    }
  }
  for (const c of candidates) {
    const v = asText(c);
    if (looksLikeNativeFacebookPostId(v)) return v;
  }
  for (const c of candidates) {
    const v = asText(c);
    if (v) return v;
  }
  return null;
};

type RawPost = {
  item: any;
  source: "platform" | "generic" | "graph";
  profileKey?: string;
  refId?: string | null;
  fbId?: string | null;
  fbName?: string | null;
};
type ProfileCandidate = {
  profileKey: string;
  refId: string | null;
  fbId: string | null;
  fbName: string | null;
  label: string;
};

const pickNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.trunc(value));
    }
    if (
      typeof value === "string" && value.trim() && !Number.isNaN(Number(value))
    ) {
      return Math.max(0, Math.trunc(Number(value)));
    }
  }
  return null;
};

const reactionTotal = (value: any): number | null => {
  if (value == null) return null;
  if (typeof value === "number") return Math.max(0, Math.trunc(value));
  if (
    typeof value === "string" && value.trim() && !Number.isNaN(Number(value))
  ) return Math.max(0, Math.trunc(Number(value)));
  if (Array.isArray(value)) {
    const total = value.reduce(
      (sum, item) =>
        sum + (pickNumber(item?.count, item?.total, item?.value, item) ?? 0),
      0,
    );
    return total > 0 ? total : null;
  }
  if (typeof value === "object") {
    const direct = pickNumber(
      value.total,
      value.total_count,
      value.count,
      value.summary?.total_count,
    );
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

  const nativeId = pickNativeFacebookPostId(it);
  const ids = Array.from(
    new Set(
      [nativeId, ...collectPostIds(it, raw.source === "platform")].filter(
        Boolean,
      ) as string[],
    ),
  );
  const primaryId = nativeId || ids[0] || null;
  if (!primaryId) return null;
  const text = String(
    it.post || it.message || it.story || it.text || it.caption ||
      it.description || "",
  );
  const createdAt = firstValidDate(
    it.created,
    it.createdAt,
    it.created_time,
    it.createdTime,
    it.publishedAt,
    it.published_at,
    it.scheduleDate,
    it.scheduledFor,
    it.lastUpdated,
    it.updated,
    it.updatedAt,
    it.timestamp,
    it.platforms?.facebook?.created,
    it.platforms?.facebook?.createdTime,
    it.platforms?.facebook?.publishedAt,
    it.platforms?.facebook?.created_time,
  ) ?? new Date().toISOString();
  const media = collectMediaUrls(it);
  const url = it.postUrl || it.permalink_url ||
    it.platforms?.facebook?.postUrl || null;
  return {
    id: primaryId,
    fb_post_id: primaryId,
    post_ids: ids,
    text,
    created_at: createdAt,
    status: it.status || it.statusType || it.platforms?.facebook?.status ||
      null,
    url,
    media,
    like_count: reactionTotal(it.reactions) ??
      pickNumber(
        it.likeCount,
        it.likes?.summary?.total_count,
        it.likes,
        it.reactionsCount,
        it.reactionsByType,
      ),
    comment_count: pickNumber(
      it.commentsCount,
      it.commentCount,
      it.comments?.summary?.total_count,
      it.comments,
      it.totalFirstLevelComments,
    ),
    share_count: pickNumber(
      it.shareCount,
      it.shares?.count,
      it.shares,
      it.sharesCount,
    ),
    view_count: pickNumber(
      it.impressionsUnique,
      it.impressionCount,
      it.impressions,
      it.videoViews,
      it.viewCount,
    ),
    _profile_key: raw.profileKey ?? null,
    _profile_ref_id: raw.refId ?? null,
    _profile_fb_id: raw.fbId ?? null,
    _profile_fb_name: raw.fbName ?? null,
    _raw_keys: Object.keys(it || {}),
    _raw: it,
  };
};

const titleFromText = (text: string) =>
  (text.trim().split("\n")[0] || "פוסט פייסבוק").slice(0, 120);

const parseMetaCredential = (
  raw: unknown,
): { token: string; pageId: string | null } => {
  const s = asText(raw);
  if (!s) return { token: "", pageId: null };
  try {
    const parsed = JSON.parse(s);
    return {
      token: asText(parsed?.page_access_token) || asText(parsed?.access_token),
      pageId: asText(parsed?.page_id) || asText(parsed?.facebook_page_id) ||
        null,
    };
  } catch {
    return { token: s, pageId: null };
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    let body: any = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }
    const lastRecords = Math.min(
      500,
      Math.max(
        1,
        Number(
          body?.lastRecords ?? url.searchParams.get("lastRecords") ?? "500",
        ),
      ),
    );
    // Ayrshare may silently cap very large page sizes; keep our request at a
    // pagination-friendly size so maxPages is high enough to walk history.
    const pageSize = Math.min(
      50,
      Math.max(
        10,
        Number(body?.pageSize ?? url.searchParams.get("pageSize") ?? 50),
      ),
    );
    const maxPages = Math.max(1, Math.ceil(lastRecords / pageSize));
    const dataType = asText(body?.dataType ?? url.searchParams.get("dataType")) ||
      "posts";
    const skipAnalytics = body?.skipAnalytics === true ||
      url.searchParams.get("skipAnalytics") === "true";
    const purge = body?.purge === true || url.searchParams.get("purge") === "true";
    const syncComments = body?.sync_comments === true ||
      url.searchParams.get("sync_comments") === "true";
    const since = asText(body?.since ?? url.searchParams.get("since"));
    const until = asText(body?.until ?? url.searchParams.get("until"));
    const persist = body?.persist !== false &&
      url.searchParams.get("persist") !== "false";
    const ownerId = asText(
      body?.user_id ?? body?.owner_id ?? url.searchParams.get("user_id"),
    ) || DEFAULT_OWNER_ID;

    const KEY = Deno.env.get("AYRSHARE_API_KEY")?.trim().replace(
      /^["']|["']$/g,
      "",
    );
    if (!KEY) throw new Error("AYRSHARE_API_KEY missing");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: ws } = await admin
      .from("workspace_social_profile")
      .select("ayrshare_profile_key, ayrshare_ref_id, facebook_page_id, facebook_page_name")
      .eq("id", WORKSPACE_ID)
      .maybeSingle();
    const profileKey = (ws?.ayrshare_profile_key?.toString().trim()) ||
      Deno.env.get("AYRSHARE_PROFILE_KEY")?.trim().replace(
        /^["']|["']$/g,
        "",
      ) || "";
    const facebookPageId = asText(ws?.facebook_page_id) ||
      asText(
        body?.facebook_page_id ?? url.searchParams.get("facebook_page_id"),
      ) || "729806313557785";

    const cooldownKey = `facebook_native_import_blocked_until:${ownerId}`;
    if (body?.force_provider_probe !== true) {
      try {
        const { data: cooldown } = await admin
          .from("campaign_settings")
          .select("value")
          .eq("key", cooldownKey)
          .maybeSingle();
        const blockedUntil = cooldown?.value ? new Date(String(cooldown.value)).getTime() : 0;
        if (Number.isFinite(blockedUntil) && blockedUntil > Date.now()) {
          return new Response(
            JSON.stringify({
              ok: false,
              count: 0,
              posts: [],
              persisted: false,
              purged: false,
              skipped_reason: "provider_cooldown_active",
              blocked_until: new Date(blockedUntil).toISOString(),
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (_cooldownErr) {
        // Non-fatal: campaign_settings may not exist in local/dev databases.
      }
    }

    const rememberProviderCooldown = async (reason: string) => {
      try {
        const blockedUntil = new Date(Date.now() + PROVIDER_COOLDOWN_MINUTES * 60_000).toISOString();
        await admin.from("campaign_settings").upsert({
          key: cooldownKey,
          value: blockedUntil,
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });
        diagnostics.push({ source: "safety", status: "cooldown_set", reason, blocked_until: blockedUntil });
      } catch (_cooldownErr) {
        // Non-fatal.
      }
    };

    const resolveGraphCredential = async (): Promise<
      { token: string; pageId: string | null; source: string | null }
    > => {
      const env = parseMetaCredential(
        Deno.env.get("FB_PAGE_ACCESS_TOKEN") ||
          Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN") ||
          Deno.env.get("META_ACCESS_TOKEN"),
      );
      if (env.token) {
        return { ...env, pageId: env.pageId || facebookPageId, source: "env" };
      }
      const { data: cfgRows } = await admin
        .from("api_configs")
        .select("api_key, service_name")
        .in("service_name", [
          "Meta Marketing API",
          "Facebook Graph API",
          "Facebook Page Access Token",
        ])
        .eq("is_active", true)
        .limit(5);
      for (const row of cfgRows ?? []) {
        const parsed = parseMetaCredential((row as any)?.api_key);
        if (parsed.token) {
          return {
            ...parsed,
            pageId: parsed.pageId || facebookPageId,
            source: (row as any)?.service_name ?? "api_configs",
          };
        }
      }
      return { token: "", pageId: facebookPageId || null, source: null };
    };

    const discoverProfiles = async (): Promise<ProfileCandidate[]> => {
      const candidates: ProfileCandidate[] = [];
      const seen = new Set<string>();
      const push = (c: ProfileCandidate) => {
        if (!c.profileKey || seen.has(c.profileKey)) return;
        seen.add(c.profileKey);
        candidates.push(c);
      };

      if (profileKey) {
        push({
          profileKey,
          refId: ws?.ayrshare_ref_id ?? null,
          fbId: ws?.facebook_page_id ?? null,
          fbName: ws?.facebook_page_name ?? null,
          label: "workspace",
        });
      }

      // Stored per-user account rows are our only recoverable source of actual
      // Profile-Key values because Ayrshare intentionally never returns profile
      // keys from GET /profiles. Always try them before public/account fallbacks.
      try {
        const { data: storedAccounts } = await admin
          .from("ayrshare_social_accounts")
          .select("profile_key, account_ref, display_name")
          .eq("platform", "facebook")
          .eq("connected", true)
          .eq("is_active", true)
          .limit(50);
        for (const row of storedAccounts ?? []) {
          const pk = asText((row as any)?.profile_key);
          if (!pk) continue;
          push({
            profileKey: pk,
            refId: null,
            fbId: asText((row as any)?.account_ref) || ws?.facebook_page_id || null,
            fbName: asText((row as any)?.display_name) || ws?.facebook_page_name || null,
            label: "stored_social_account",
          });
        }
      } catch (storedErr) {
        console.warn("[fb-recent-posts] stored account discovery failed", storedErr);
      }

      try {
        const listRes = await fetch(`${AYR_BASE}/profiles`, {
          headers: { Authorization: `Bearer ${KEY}` },
        });
        const listJson = await listRes.json().catch(() => ({} as any));
        const profiles: any[] = Array.isArray(listJson?.profiles)
          ? listJson.profiles
          : Array.isArray(listJson)
          ? listJson
          : [];
        for (const p of profiles.slice(0, 500)) {
          const pk = asText(p?.profileKey);
          if (!pk) continue;
          try {
            const userRes = await fetch(`${AYR_BASE}/user`, {
              headers: { Authorization: `Bearer ${KEY}`, "Profile-Key": pk },
            });
            const userJson = await userRes.json().catch(() => ({} as any));
            if (!userRes.ok) continue;
            const active = Array.isArray(userJson?.activeSocialAccounts)
              ? userJson.activeSocialAccounts.map((v: any) =>
                String(v || "").toLowerCase()
              )
              : [];
            const displayNames = Array.isArray(userJson?.displayNames)
              ? userJson.displayNames
              : [];
            const fb = displayNames.find((a: any) =>
              String(a?.platform || "").toLowerCase() === "facebook"
            );
            const hasFacebook = active.includes("facebook") || !!fb;
            if (!hasFacebook) continue;
            const fbId = asText(fb?.id ?? fb?.pageId) || null;
            const fbName =
              asText(fb?.displayName ?? fb?.username ?? fb?.name) || null;
            push({
              profileKey: pk,
              refId: asText(p?.refId) || null,
              fbId,
              fbName,
              label: asText(p?.title) || "profile",
            });
          } catch (_profileErr) {
            // Keep scanning other profiles. One suspended profile must not stop the import.
          }
        }
      } catch (profileListErr) {
        console.warn(
          "[fb-recent-posts] profile discovery failed",
          profileListErr,
        );
      }

      const targetFbId = asText(ws?.facebook_page_id);
      return candidates.sort((a, b) => {
        const aMatch = targetFbId && a.fbId === targetFbId ? 0 : 1;
        const bMatch = targetFbId && b.fbId === targetFbId ? 0 : 1;
        return aMatch - bMatch;
      });
    };

    const fetchPlatformHistory = async (
      candidate: ProfileCandidate | null,
      pagePublished?: boolean,
    ): Promise<{ posts: RawPost[]; status: number; error: any; reachedEnd: boolean }> => {
      const seenIds = new Set<string>();
      const rows: RawPost[] = [];
      let status = 0;
      let error: any = null;
      let nextCursor: string | null = null;
      let reachedEnd = false;

      for (let page = 0; page < maxPages; page++) {
        const qs = new URLSearchParams({
          limit: String(pageSize),
          lastRecords: String(lastRecords),
          dataType,
          // Critical: Ayrshare defaults can return only a short recent slice.
          // lastDays=0 means full available history for the connected native
          // Facebook Page, which is required to recover the full native feed.
          lastDays: "0",
        });
        if (skipAnalytics) qs.set("skipAnalytics", "true");
        if (typeof pagePublished === "boolean") {
          qs.set("pagePublished", String(pagePublished));
        }
        if (since) qs.set("since", since);
        if (until) qs.set("until", until);
        if (nextCursor) { qs.set("next", nextCursor); qs.set("lastId", nextCursor); }
        const headers: Record<string, string> = {
          Authorization: `Bearer ${KEY}`,
        };
        if (candidate?.profileKey) {
          headers["Profile-Key"] = candidate.profileKey;
        }
        const resp = await fetch(
          `${AYR_BASE}/history/facebook?${qs.toString()}`,
          { headers },
        );
        status = resp.status;
        const json = await resp.json().catch(() => ({} as any));
        if (!resp.ok) {
          error = json;
          break;
        }
        const items: any[] = Array.isArray(json)
          ? json
          : (json.posts || json.history || json.data || []);
        if (!items.length) break;
        let added = 0;
        for (const it of items) {
          if (
            String(it?.status || "").toLowerCase() === "error" ||
            (Array.isArray(it?.errors) && it.errors.length > 0)
          ) continue;
          const ids = collectPostIds(it, true);
          const id = pickNativeFacebookPostId(it) || ids[0] ||
            JSON.stringify(it).slice(0, 96);
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
        const lastItem = items[items.length - 1];
        const fallbackCursor = asText(lastItem?.id) ||
          pickNativeFacebookPostId(lastItem) ||
          collectPostIds(lastItem, true)[0] || null;
        nextCursor = json?.lastId || json?.meta?.pagination?.next || json?.next ||
          json?.nextToken || json?.next_token || json?.pageToken ||
          (items.length >= pageSize ? fallbackCursor : null);
        const hasMore = Boolean(json?.meta?.pagination?.hasMore || nextCursor);
        reachedEnd = !hasMore;
        if (!hasMore && added === 0) break;
        if (!hasMore) break;
        if (rows.length >= lastRecords) break;
      }

      return { posts: rows, status, error, reachedEnd };
    };

    const fetchGenericHistory = async (): Promise<
      { posts: RawPost[]; status: number; error: any }
    > => {
      if (!profileKey) {
        return {
          posts: [],
          status: 0,
          error: "workspace ayrshare_profile_key missing",
        };
      }
      const seenIds = new Set<string>();
      const rows: RawPost[] = [];
      let status = 0;
      let error: any = null;
      let nextCursor: string | null = null;

      for (let page = 0; page < maxPages && rows.length < lastRecords; page++) {
        const genericQs = new URLSearchParams({
          platforms: "facebook",
          limit: String(pageSize),
          lastRecords: String(lastRecords),
          lastDays: "0",
          dataType,
        });
        if (skipAnalytics) genericQs.set("skipAnalytics", "true");
        if (nextCursor) {
          genericQs.set("next", nextCursor);
          genericQs.set("lastId", nextCursor);
        }
        const resp = await fetch(`${AYR_BASE}/history?${genericQs.toString()}`, {
          headers: { Authorization: `Bearer ${KEY}`, "Profile-Key": profileKey },
        });
        status = resp.status;
        const json = await resp.json().catch(() => ({} as any));
        if (!resp.ok) {
          error = json;
          break;
        }
        const items: any[] = Array.isArray(json)
          ? json
          : (json.posts || json.history || json.data || []);
        if (!items.length) break;
        for (const it of items) {
          if (
            String(it?.status || "").toLowerCase() === "error" ||
            (Array.isArray(it?.errors) && it.errors.length > 0)
          ) continue;
          const ids = collectPostIds(it, true);
          const id = pickNativeFacebookPostId(it) || ids[0];
          if (!id || seenIds.has(id)) continue;
          seenIds.add(id);
          rows.push({ item: it, source: "generic", profileKey });
        }
        const lastItem = items[items.length - 1];
        const fallbackCursor = asText(lastItem?.id) ||
          pickNativeFacebookPostId(lastItem) ||
          collectPostIds(lastItem, true)[0] || null;
        nextCursor = json?.lastId || json?.meta?.pagination?.next || json?.next ||
          json?.nextToken || json?.next_token || json?.pageToken ||
          (items.length >= pageSize ? fallbackCursor : null);
        if (!nextCursor) break;
      }
      return { posts: rows, status, error };
    };

    const fetchGraphHistory = async (): Promise<
      { posts: RawPost[]; status: number; error: any; source: string | null }
    > => {
      const cred = await resolveGraphCredential();
      if (!cred.token || !cred.pageId) {
        return {
          posts: [],
          status: 0,
          error: "facebook_page_access_token_missing",
          source: cred.source,
        };
      }
      const fields = [
        "id",
        "message",
        "story",
        "created_time",
        "full_picture",
        "permalink_url",
        "attachments{media,url,type,subattachments{media,url,type}}",
        "likes.summary(true).limit(0)",
        "comments.summary(true).limit(0)",
        "shares",
      ].join(",");
      let nextUrl = `${
        new URL(`${cred.pageId}/posts`, "https://graph.facebook.com/v20.0/")
          .toString()
      }?${
        new URLSearchParams({
          fields,
          limit: String(Math.min(100, Math.max(10, pageSize))),
          access_token: cred.token,
        }).toString()
      }`;
      const rows: RawPost[] = [];
      const seen = new Set<string>();
      let status = 0;
      let error: any = null;
      for (
        let page = 0;
        page < maxPages && nextUrl && rows.length < lastRecords;
        page++
      ) {
        const resp = await fetch(nextUrl);
        status = resp.status;
        const json = await resp.json().catch(() => ({} as any));
        if (!resp.ok) {
          error = json?.error ?? json;
          break;
        }
        const items: any[] = Array.isArray(json?.data) ? json.data : [];
        if (!items.length) break;
        for (const it of items) {
          const id = asText(it?.id);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          rows.push({
            item: {
              ...it,
              post: it.message ?? it.story ?? "",
              fbId: id,
              postId: id,
              created: it.created_time,
              postUrl: it.permalink_url,
            },
            source: "graph",
            profileKey,
            refId: null,
            fbId: cred.pageId,
            fbName: ws?.facebook_page_name ?? null,
          });
        }
        nextUrl = typeof json?.paging?.next === "string"
          ? json.paging.next
          : "";
      }
      return { posts: rows, status, error, source: cred.source };
    };

    const candidates = await discoverProfiles();
    const allById = new Map<string, RawPost>();
    const diagnostics: any[] = [];
    const mediaScore = (post: RawPost) => collectMediaUrls(post.item).length;
    const qualityScore = (post: RawPost) => {
      const it = post.item;
      const hasDate = firstValidDate(
        it?.created,
        it?.createdAt,
        it?.created_time,
        it?.createDate,
        it?.publishedAt,
        it?.scheduleDate,
      ) ? 1 : 0;
      const hasCounters = pickNumber(
        it?.likeCount,
        it?.commentsCount,
        it?.commentCount,
        it?.shareCount,
        it?.shares?.count,
      ) !== null ? 1 : 0;
      return mediaScore(post) * 100 + hasDate * 20 + hasCounters * 10 +
        (post.source === "graph" ? 5 : 0);
    };
    const mergePosts = (posts: RawPost[]) => {
      for (const post of posts) {
        const id = pickNativeFacebookPostId(post.item) ||
          collectPostIds(post.item, true)[0] ||
          JSON.stringify(post.item).slice(0, 96);
        const existing = allById.get(id);
        if (!existing || qualityScore(post) > qualityScore(existing)) {
          allById.set(id, post);
        }
      }
    };
    let lastStatus = 0;
    let lastError: any = null;
    let winningProfile: ProfileCandidate | null = null;

    let providerBlocked = false;
    for (const candidate of candidates) {
      if (providerBlocked) break;
      const result = await fetchPlatformHistory(candidate, true);
      diagnostics.push({ source: "history/facebook", profile: candidate.label, profileKey: candidate.profileKey.slice(0, 8), pagePublished: true, status: result.status, count: result.posts.length, error: result.error });
      if (result.status === 403 || result.status === 429) {
        providerBlocked = true;
        await rememberProviderCooldown(result.status === 403 ? "profile_suspended_or_forbidden" : "provider_rate_limited");
      }
      const broadResult = result.posts.length < Math.min(50, lastRecords)
        ? (providerBlocked ? result : await fetchPlatformHistory(candidate, undefined))
        : result;
      if (broadResult !== result) diagnostics.push({ source: "history/facebook", profile: candidate.label, profileKey: candidate.profileKey.slice(0, 8), pagePublished: null, status: broadResult.status, count: broadResult.posts.length, error: broadResult.error });
      if (broadResult.status === 403 || broadResult.status === 429) {
        providerBlocked = true;
        await rememberProviderCooldown(broadResult.status === 403 ? "profile_suspended_or_forbidden" : "provider_rate_limited");
      }
      const bestResult = broadResult.posts.length > result.posts.length
        ? broadResult
        : result;
      lastStatus = bestResult.status;
      lastError = bestResult.error;
      mergePosts(result.posts);
      if (broadResult !== result) mergePosts(broadResult.posts);
      if (bestResult.posts.length > (winningProfile ? 0 : -1)) {
        winningProfile = candidate;
      }
      if (allById.size >= lastRecords) break;
    }

    // The platform-specific history endpoint has changed behavior across
    // Ayrshare versions/plans: some tenants return the full native Page history
    // with only the API key, while sub-profile calls can return a short recent
    // slice. Always compare both routes and keep the richest result.
    if (!providerBlocked && allById.size < Math.min(150, lastRecords)) {
      const accountPublished = await fetchPlatformHistory(null, true);
      diagnostics.push({ source: "history/facebook", profile: "account", pagePublished: true, status: accountPublished.status, count: accountPublished.posts.length, error: accountPublished.error });
      if (accountPublished.status === 403 || accountPublished.status === 429) {
        providerBlocked = true;
        await rememberProviderCooldown(accountPublished.status === 403 ? "account_forbidden" : "provider_rate_limited");
      }
      const accountBroad =
        accountPublished.posts.length < Math.min(150, lastRecords)
          ? (providerBlocked ? accountPublished : await fetchPlatformHistory(null, undefined))
          : accountPublished;
      if (accountBroad !== accountPublished) diagnostics.push({ source: "history/facebook", profile: "account", pagePublished: null, status: accountBroad.status, count: accountBroad.posts.length, error: accountBroad.error });
      const accountBest =
        accountBroad.posts.length > accountPublished.posts.length
          ? accountBroad
          : accountPublished;
      lastStatus = accountBest.status || lastStatus;
      lastError = accountBest.error ?? lastError;
      mergePosts(accountPublished.posts);
      if (accountBroad !== accountPublished) mergePosts(accountBroad.posts);
      if (accountBest.posts.length > 0) winningProfile = null;
    }

    if (!providerBlocked && allById.size < Math.min(150, lastRecords)) {
      const genericResult = await fetchGenericHistory();
      diagnostics.push({ source: "history", profile: "workspace", status: genericResult.status, count: genericResult.posts.length, error: genericResult.error });
      if (genericResult.status === 403 || genericResult.status === 429) {
        providerBlocked = true;
        await rememberProviderCooldown(genericResult.status === 403 ? "profile_suspended_or_forbidden" : "provider_rate_limited");
      }
      lastStatus = genericResult.status || lastStatus;
      lastError = genericResult.error ?? lastError;
      mergePosts(genericResult.posts);
    }

    // Ayrshare's list endpoint can occasionally return a sparse row
    // (`id/isPopular/post`) for older native Facebook posts. Hydrate those rows
    // through the Social Post ID endpoint so every stored card gets the native
    // created date, mediaUrls/fullPicture, and live counters when available.
    const enrichSparseWithSocialHistory = async () => {
      const entries = Array.from(allById.entries()).filter(([, raw]) => {
        const normalized = normalizePost(raw);
        return !normalized || normalized.media.length === 0 ||
          !firstValidDate(raw.item?.created, raw.item?.created_time, raw.item?.createDate) ||
          normalized.like_count === null || normalized.comment_count === null;
      });
      for (let i = 0; i < entries.length; i += 4) {
        await Promise.all(entries.slice(i, i + 4).map(async ([id, raw]) => {
          const nativeId = pickNativeFacebookPostId(raw.item) || id;
          if (!nativeId || isUuidLike(nativeId)) return;
          const headers: Record<string, string> = { Authorization: `Bearer ${KEY}` };
          if (raw.profileKey) headers["Profile-Key"] = raw.profileKey;
          const detailUrl = `${AYR_BASE}/history/${encodeURIComponent(nativeId)}?searchPlatformId=true&platform=facebook`;
          try {
            const resp = await fetch(detailUrl, { headers, signal: AbortSignal.timeout(12_000) });
            if (!resp.ok) return;
            const json = await resp.json().catch(() => null);
            const detail = Array.isArray(json) ? json[0] : json;
            if (!detail || typeof detail !== "object") return;
            mergePosts([{ ...raw, item: { ...raw.item, ...detail } }]);
          } catch (_detailErr) {
            // Non-fatal: keep the list result if the detail endpoint throttles.
          }
        }));
        await delay(250);
      }
    };

    const isUuidLike = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    if (!providerBlocked) await enrichSparseWithSocialHistory();

    let graphSource: string | null = null;
    if (!providerBlocked && allById.size < Math.min(150, lastRecords)) {
      const graphResult = await fetchGraphHistory();
      diagnostics.push({ source: "graph", profile: graphResult.source, status: graphResult.status, count: graphResult.posts.length, error: graphResult.error });
      graphSource = graphResult.source;
      lastStatus = graphResult.status || lastStatus;
      lastError = graphResult.error ?? lastError;
      mergePosts(graphResult.posts);
    }

    if (
      winningProfile?.profileKey && winningProfile.profileKey !== profileKey
    ) {
      await admin
        .from("workspace_social_profile")
        .update({
          ayrshare_profile_key: winningProfile.profileKey,
          ayrshare_ref_id: winningProfile.refId,
          facebook_page_id: winningProfile.fbId ?? ws?.facebook_page_id ?? null,
          facebook_page_name: winningProfile.fbName ?? ws?.facebook_page_name ??
            null,
          connected_platforms: ["facebook"],
          updated_at: new Date().toISOString(),
        })
        .eq("id", WORKSPACE_ID);
    }

    const all = Array.from(allById.values());
    const normalized = all.map(normalizePost).filter((
      p,
    ): p is NonNullable<ReturnType<typeof normalizePost>> => !!p);
    const byNativeId = new Map<
      string,
      NonNullable<ReturnType<typeof normalizePost>>
    >();
    for (const p of normalized) {
      const existing = byNativeId.get(p.fb_post_id);
      if (!existing || (!existing.media.length && p.media.length)) {
        byNativeId.set(p.fb_post_id, p);
      }
    }
    const posts = Array.from(byNativeId.values()).slice(0, lastRecords);

    let upserted = 0;
    let persistError: string | null = null;
    let purgeApplied = false;
    let purgeSkippedReason: string | null = null;
    if (persist && posts.length > 0) {
      if (purge) {
        if (posts.length >= MIN_SAFE_PURGE_POSTS) {
          await admin
            .from("engagement_events")
            .delete()
            .eq("user_id", ownerId)
            .eq("platform", "facebook");
          await admin
            .from("campaign_logs")
            .delete()
            .eq("user_id", ownerId)
            .eq("channel", "facebook");
          purgeApplied = true;
        } else {
          purgeSkippedReason = `provider_returned_too_few_posts:${posts.length}/${MIN_SAFE_PURGE_POSTS}`;
        }
      }
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
            facebook_page_id: p._profile_fb_id ?? ws?.facebook_page_id ?? null,
            facebook_page_name: p._profile_fb_name ?? ws?.facebook_page_name ??
              null,
            postIds: p.post_ids.map((id: string) => ({
              platform: "facebook",
              id,
              postUrl: p.url || null,
            })),
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

    let commentSyncQueued = false;
    if (persist && syncComments && posts.length > 0) {
      const postIds = posts.map((p) => p.fb_post_id).filter(Boolean);
      const syncTask = (async () => {
        for (let i = 0; i < postIds.length; i += 2) {
          const chunk = postIds.slice(i, i + 2);
          try {
            await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/ayrshare-comments-fetch`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                user_id: ownerId,
                post_ids: chunk,
                platform: "facebook",
                force_refresh: true,
              }),
            }).catch(() => null);
          } catch (_commentErr) {
            // Keep processing subsequent chunks.
          }
          await delay(7_000);
        }
      })();
      const edgeRuntime = (globalThis as any).EdgeRuntime;
      if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(syncTask);
      else await syncTask;
      commentSyncQueued = true;
    }

    // Full Graph enrichment: for every stored native FB post, batch-fetch
    // full_picture + attachments (thumbnails), live engagement counters
    // (reactions/comments/shares) AND the true native created_time. This
    // guarantees UI cards show the real photo, real counters, and the
    // original publish date — never the import moment or a zero counter.
    let enrichedMedia = 0;
    let enrichedCounters = 0;
    let enrichedDates = 0;
    try {
      const cred = await resolveGraphCredential();
      if (cred.token) {
        const { data: allFbPosts } = await admin
          .from("campaign_logs")
          .select("id, provider_message_id, provider_response, created_at, like_count, comment_count, share_count")
          .eq("channel", "facebook")
          .eq("user_id", ownerId)
          .eq("is_archived", false)
          .not("provider_message_id", "is", null)
          .limit(500);
        const targets = (allFbPosts || []).filter((r: any) =>
          /^\d{5,}(_\d{5,})?$/.test(String(r.provider_message_id || ""))
        );
        const graphFields =
          "full_picture,attachments{media,subattachments{media}},reactions.summary(true).limit(0),likes.summary(true).limit(0),comments.summary(true).limit(0),shares,created_time";
        for (let i = 0; i < targets.length; i += 40) {
          const chunk = targets.slice(i, i + 40);
          const ids = chunk.map((t: any) => String(t.provider_message_id)).join(",");
          const url = `https://graph.facebook.com/v20.0/?ids=${encodeURIComponent(ids)}&fields=${encodeURIComponent(graphFields)}&access_token=${encodeURIComponent(cred.token)}`;
          const resp = await fetch(url);
          if (!resp.ok) continue;
          const json: any = await resp.json().catch(() => ({}));
          for (const t of chunk) {
            const pid = String(t.provider_message_id);
            const entry = json?.[pid];
            if (!entry) continue;

            // Media URLs
            const urls: string[] = [];
            const push = (u: any) => { if (typeof u === "string" && /^https?:\/\//.test(u) && !urls.includes(u)) urls.push(u); };
            push(entry.full_picture);
            const visit = (node: any) => {
              if (!node) return;
              if (Array.isArray(node)) { node.forEach(visit); return; }
              push(node?.media?.image?.src);
              push(node?.media?.source);
              if (node.subattachments?.data) visit(node.subattachments.data);
            };
            if (entry.attachments?.data) visit(entry.attachments.data);

            // Live engagement counters
            const likeCount = pickNumber(
              entry?.reactions?.summary?.total_count,
              entry?.likes?.summary?.total_count,
            );
            const commentCount = pickNumber(entry?.comments?.summary?.total_count);
            const shareCount = pickNumber(entry?.shares?.count);

            // True native created_time
            const nativeCreatedAt = firstValidDate(entry?.created_time);

            const existingMedia = Array.isArray((t as any).provider_response?.media_urls)
              ? (t as any).provider_response.media_urls
              : [];
            const mergedMedia = urls.length > 0 ? urls : existingMedia;

            const updatePayload: Record<string, unknown> = {
              provider_response: {
                ...((t as any).provider_response || {}),
                media_urls: mergedMedia,
                graph_enriched_at: new Date().toISOString(),
                native_created_time: entry?.created_time ?? null,
              },
            };
            if (urls.length > 0) { enrichedMedia++; }
            if (likeCount !== null) updatePayload.like_count = likeCount;
            if (commentCount !== null) updatePayload.comment_count = commentCount;
            if (shareCount !== null) updatePayload.share_count = shareCount;
            if (likeCount !== null || commentCount !== null || shareCount !== null) {
              updatePayload.metrics_updated_at = new Date().toISOString();
              enrichedCounters++;
            }
            if (nativeCreatedAt) {
              updatePayload.created_at = nativeCreatedAt;
              updatePayload.sent_at = nativeCreatedAt;
              enrichedDates++;
            }

            await admin.from("campaign_logs").update(updatePayload).eq("id", (t as any).id);
          }
        }
      }
    } catch (enrichErr) {
      console.warn("[fb-recent-posts] graph enrichment failed", enrichErr);
    }



    return new Response(
      JSON.stringify({
        ok: true,
        count: posts.length,
        posts,
        persisted: persist,
        upserted,
        enriched_media: enrichedMedia,
        enriched_counters: enrichedCounters,
        enriched_dates: enrichedDates,
        comment_sync_queued: commentSyncQueued,
        purged: purgeApplied,
        purge_requested: purge && persist,
        purge_skipped_reason: purgeSkippedReason,
        persist_error: persistError,

        owner_id: ownerId,
        raw_status: lastStatus,
        raw_error: lastError,
        graph_source: graphSource,
        diagnostics,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

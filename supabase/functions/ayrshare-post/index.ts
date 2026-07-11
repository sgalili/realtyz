// Realtyz ayrshare-post — publishes a campaign post to one or more social
// channels via the workspace's Ayrshare profile, then writes one row per
// channel into campaign_logs scoped to the owning user_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  clearStaleAyrshareConnection,
  isAyrshareInvalidProfileKey,
  MISSING_TENANT_KEY,
  MISSING_TENANT_KEY_MESSAGE,
  resolveWorkspaceProfileKey,
  stripMarkdownEmphasis,
  verifyWorkspaceProfileKey,
} from "../_shared/ayrshare-helpers.ts";
import { guardOutboundAction, recordAyrshareAction } from "../_shared/ayrshare-safety.ts";
import { circuitOpenResponse, readCircuit, tripOnAyrshareFailure } from "../_shared/ayrshare-circuit.ts";
import { enforceOwnerLaws, fetchOwnerBranding } from "../_shared/owner-laws.ts";

const AYR_POST_URL = "https://api.ayrshare.com/api/post";

const PROVIDER_RATE_LIMIT_MESSAGE =
  "המערכת הגיעה למגבלת קצב זמנית. אנא המתן מספר דקות לפני ניסיון נוסף.";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const providerCode = (payload: any, errors: any[] = []) =>
  Number(errors[0]?.code ?? payload?.code ?? payload?.raw?.code ?? 0);

const providerMessage = (payload: any, errors: any[] = [], fallback = "שגיאת פרסום") =>
  String(
    errors[0]?.message ??
      payload?.errors?.[0]?.message ??
      payload?.message ??
      payload?.error ??
      payload?.raw?.message ??
      fallback,
  );

const isProviderRateLimited = (status: number, payload: any, errors: any[] = []) =>
  status === 429 || status === 502 || providerCode(payload, errors) === 105;

const providerFailure = (
  status: number,
  payload: any,
  errors: any[] = [],
  fallback = "שגיאת פרסום",
) => {
  const rateLimited = isProviderRateLimited(status, payload, errors);
  return {
    success: false,
    error: rateLimited ? "rate_limit_exceeded" : "provider_error",
    message: rateLimited ? PROVIDER_RATE_LIMIT_MESSAGE : providerMessage(payload, errors, fallback),
    code: providerCode(payload, errors) || null,
    status,
    details: payload,
  };
};

// Map our internal channel ids → Ayrshare platform ids
const PLATFORM_MAP: Record<string, string> = {
  facebook: "facebook",
  instagram: "instagram",
  x: "twitter",
  twitter: "twitter",
  linkedin: "linkedin",
  youtube: "youtube",
  tiktok: "tiktok",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── DELETE: remove a previously published post from the native social
  //     network via Ayrshare, then optionally purge the local campaign_logs
  //     row. Body: { external_post_id: string, platform?: string }.
  if (req.method === "DELETE") {
    try {
      const AYRSHARE_API_KEY = Deno.env.get("AYRSHARE_API_KEY");
      if (!AYRSHARE_API_KEY) {
        return json({ success: false, error: "service_unavailable", message: "שירות הפרסום אינו מוגדר כרגע." }, 200);
      }
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(SUPABASE_URL, SERVICE, {
        auth: { persistSession: false },
      });
      const circuitDel = await readCircuit(admin);
      if (circuitDel) return circuitOpenResponse(circuitDel, corsHeaders);

      const token = (req.headers.get("Authorization") ?? "").replace(
        /^Bearer\s+/i,
        "",
      ).trim();
      if (!token) return json({ error: "unauthorized" }, 401);
      const { data: authData } = await admin.auth.getUser(token);
      const userId = authData?.user?.id;
      if (!userId) return json({ error: "unauthorized" }, 401);

      const url = new URL(req.url);
      const body = await req.json().catch(() => ({}));
      const externalPostId: string = String(
        body?.external_post_id ?? body?.id ??
          url.searchParams.get("external_post_id") ??
          url.searchParams.get("id") ?? "",
      ).trim();
      if (!externalPostId) {
        return json({ error: "missing external_post_id" }, 400);
      }

      const { profileKey } = await resolveWorkspaceProfileKey(admin);
      if (!profileKey) {
        return json({
          success: false,
          error: MISSING_TENANT_KEY,
          message: MISSING_TENANT_KEY_MESSAGE,
        }, 200);
      }

      const r = await fetch(
        `${AYR_POST_URL}/${encodeURIComponent(externalPostId)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${AYRSHARE_API_KEY}`,
            "Profile-Key": profileKey,
            "Content-Type": "application/json",
          },
        },
      );
      const t = await r.text();
      let j: any = null;
      try {
        j = t ? JSON.parse(t) : null;
      } catch {
        j = { raw: t };
      }
      // Treat a 404 from Ayrshare as already-deleted (idempotent success).
      const idempotent404 = r.status === 404;
      if (isAyrshareInvalidProfileKey(r.status, j)) {
        await clearStaleAyrshareConnection(
          admin,
          "Ayrshare profile rejected during post delete",
        );
        return json({
          success: false,
          error: MISSING_TENANT_KEY,
          message: MISSING_TENANT_KEY_MESSAGE,
        }, 200);
      }
      if (!r.ok && !idempotent404) {
        return json(providerFailure(r.status, j, [], `Ayrshare ${r.status}`), 200);
      }
      return json({ success: true, ayrshare: j, idempotent: idempotent404 });
    } catch (e) {
      console.error("[ayrshare-post DELETE] error:", e);
      return json({
        success: false,
        error: "service_failed",
        message: e instanceof Error ? e.message : "שגיאה לא ידועה",
      }, 200);
    }
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);

  try {
    const AYRSHARE_API_KEY = Deno.env.get("AYRSHARE_API_KEY");
    if (!AYRSHARE_API_KEY) {
      return json({ success: false, error: "service_unavailable", message: "שירות הפרסום אינו מוגדר כרגע." }, 200);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE, {
      auth: { persistSession: false },
    });
    const circuit = await readCircuit(admin);
    if (circuit) return circuitOpenResponse(circuit, corsHeaders);

    const body = await req.json().catch(() => ({}));
    const postText: string = stripMarkdownEmphasis(
      String(body?.post ?? body?.message ?? ""),
    ).trim();
    const rawChannels: string[] = Array.isArray(body?.channels)
      ? body.channels
      : [];
    const campaignName: string = String(body?.campaign_name ?? "Campaign");
    const rawMediaInput: unknown[] = Array.isArray(body?.media_urls)
      ? body.media_urls.filter(Boolean)
      : [];
    const listingId: string | null = body?.listing_id ?? null;
    const scheduledAtRaw: string | null = typeof body?.scheduled_at === "string"
      ? body.scheduled_at
      : null;
    const targetProfileKey: string =
      typeof body?.target_profile_key === "string"
        ? body.target_profile_key.trim()
        : "";
    const targetAccountRef: string | null =
      typeof body?.target_account_ref === "string"
        ? body.target_account_ref.trim() || null
        : null;
    const groupIds: string[] = Array.isArray(body?.group_ids)
      ? body.group_ids.map((g: unknown) => String(g ?? "").trim()).filter(
        Boolean,
      )
      : [];
    const firstComment: string = typeof body?.first_comment === "string"
      ? body.first_comment.trim()
      : "";
    let scheduledIso: string | null = null;
    if (scheduledAtRaw) {
      const d = new Date(scheduledAtRaw);
      if (Number.isNaN(d.getTime())) {
        return json({ error: "invalid scheduled_at" }, 400);
      }
      if (d.getTime() <= Date.now() + 30_000) {
        return json({ error: "scheduled_at must be in the future" }, 400);
      }
      scheduledIso = d.toISOString();
    }

    if (!postText) return json({ error: "missing post text" }, 400);
    if (rawChannels.length === 0) {
      return json({ error: "no channels selected" }, 400);
    }

    // Resolve caller from Authorization header (user_id isolation).
    // Also support service-role + x-impersonate-user (used by WhatsApp
    // companion router so an owner can publish directly from WhatsApp).
    const token = (req.headers.get("Authorization") ?? "").replace(
      /^Bearer\s+/i,
      "",
    ).trim();
    if (!token) return json({ error: "unauthorized" }, 401);
    let userId: string | null = null;
    const impersonate = (req.headers.get("x-impersonate-user") ?? "").trim();
    if (token === SERVICE && impersonate) {
      userId = impersonate;
    } else {
      const { data: authData } = await admin.auth.getUser(token);
      userId = authData?.user?.id ?? null;
    }
    if (!userId) return json({ error: "unauthorized" }, 401);
    const requestedOwnerId = typeof body?.workspace_owner_id === "string"
      ? body.workspace_owner_id.trim()
      : "";
    let ownerUserId = userId;
    if (requestedOwnerId && requestedOwnerId !== userId) {
      const { data: member } = await admin
        .from("workspace_memberships")
        .select("user_id")
        .eq("workspace_owner_id", requestedOwnerId)
        .eq("user_id", userId)
        .maybeSingle();
      if (member) ownerUserId = requestedOwnerId;
    }

    // Enforce owner laws (strip street numbers, append broker license footer).
    // Footer is appended ONLY when an actual listing is attached to this post;
    // general/brand posts (no listing_id) publish without the property signature.
    const branding = await fetchOwnerBranding(admin as any, ownerUserId);
    const finalPostText = enforceOwnerLaws(postText, {
      license: branding.license,
      byline: branding.byline,
      withLicense: !!listingId,
    });

    const platforms = Array.from(
      new Set(
        rawChannels.map((c) => PLATFORM_MAP[String(c).toLowerCase()]).filter(
          Boolean,
        ),
      ),
    );
    if (platforms.length === 0) {
      return json({ error: "no supported social channels in selection" }, 400);
    }

    const { profileKey: workspaceProfileKey, refId } =
      await resolveWorkspaceProfileKey(admin);
    const profileKey = targetProfileKey || workspaceProfileKey;
    if (!profileKey) {
      return json({
        success: false,
        error: MISSING_TENANT_KEY,
        message: MISSING_TENANT_KEY_MESSAGE,
      }, 200);
    }
    const verified = await verifyWorkspaceProfileKey({
      apiKey: AYRSHARE_API_KEY,
      profileKey,
    });
    if (verified.missingTenantKey) {
      console.error("[ayrshare-post] invalid workspace profile key", {
        refId,
        status: verified.status,
        code: verified.payload?.code ?? verified.payload?.raw?.code,
        message: verified.payload?.message ?? verified.payload?.error ??
          verified.payload?.raw?.message,
      });
      await clearStaleAyrshareConnection(
        admin,
        "Ayrshare profile rejected during post verification",
      );
      return json({
        success: false,
        error: MISSING_TENANT_KEY,
        message: MISSING_TENANT_KEY_MESSAGE,
      }, 200);
    }

    // ---- Media resolution ---------------------------------------------------
    // Ayrshare requires PUBLIC, absolute https URLs under the top-level
    // `mediaUrls` array. We accept several inbound shapes and transform
    // every entry into a public link before posting:
    //   - "https://…"                         → kept as-is
    //   - "bucket/path/in/storage.jpg"        → storage.from(bucket).getPublicUrl
    //   - { url: "https://…" }                → use url
    //   - { bucket, path }                    → getPublicUrl(path)
    //   - "blob:…" / "data:…" / other paths   → rejected (FB can't fetch)
    const KNOWN_PUBLIC_BUCKETS = new Set(["media-library", "agency-logos"]);
    const resolvePublicUrl = async (entry: unknown): Promise<string | null> => {
      if (!entry) return null;
      if (typeof entry === "object") {
        const obj = entry as Record<string, unknown>;
        if (typeof obj.url === "string" && /^https?:\/\//i.test(obj.url)) {
          return obj.url;
        }
        const bucket = typeof obj.bucket === "string" ? obj.bucket : null;
        const path = typeof obj.path === "string" ? obj.path : null;
        if (bucket && path) {
          const { data } = admin.storage.from(bucket).getPublicUrl(path);
          return data?.publicUrl ?? null;
        }
        return null;
      }
      if (typeof entry !== "string") return null;
      const s = entry.trim();
      if (!s) return null;
      if (/^https?:\/\//i.test(s)) return s;
      // blob:/data:/file: paths are unreachable from FB — block them explicitly
      if (/^(blob:|data:|file:)/i.test(s)) return null;
      // bucket/path/... — first segment must be a known public bucket
      const [maybeBucket, ...rest] = s.split("/");
      if (maybeBucket && rest.length && KNOWN_PUBLIC_BUCKETS.has(maybeBucket)) {
        const { data } = admin.storage.from(maybeBucket).getPublicUrl(
          rest.join("/"),
        );
        return data?.publicUrl ?? null;
      }
      // Pure storage path with no bucket prefix — default to media-library.
      const { data } = admin.storage.from("media-library").getPublicUrl(s);
      return data?.publicUrl ?? null;
    };

    const resolvedMedia = (
      await Promise.all(rawMediaInput.map((m) => resolvePublicUrl(m)))
    ).filter((u): u is string =>
      typeof u === "string" && /^https?:\/\//i.test(u)
    );

    // Emergency guard: if the caller intended to attach media but every entry
    // failed to resolve to a public URL, refuse to publish a broken text-only
    // ad rather than silently dropping the images.
    if (rawMediaInput.length > 0 && resolvedMedia.length === 0) {
      console.error("[ayrshare-post] media-resolution failure", {
        rawMediaInput,
      });
      return json({
        error:
          "כל התמונות שצורפו אינן זמינות ככתובת ציבורית. העלה את התמונות לספריית המדיה ונסה שוב.",
        code: "media_resolution_failed",
        attempted: rawMediaInput.length,
      }, 422);
    }

    // Shared helpers — collect Ayrshare per-post errors and friendly messages.
    const collectErrors = (j: any): any[] => {
      const flat = Array.isArray(j?.errors) ? j.errors : [];
      const wrapped = Array.isArray(j?.posts)
        ? j.posts.flatMap((p: any) => Array.isArray(p?.errors) ? p.errors : [])
        : [];
      return [...flat, ...wrapped];
    };
    const friendlyFromCode = (
      code: number | string | undefined,
      fallback: string,
    ): string => {
      const c = Number(code);
      if (c === 137) {
        return "פייסבוק חוסם פרסום של תוכן זהה תוך 48 שעות. שנה מעט את הכיתוב (כותרת, אימוג׳י או משפט פתיחה) ונסה שוב.";
      }
      if (c === 156 || c === 155) {
        return "פג תוקף החיבור לפייסבוק. חבר את הדף מחדש מהגדרות ערוצים.";
      }
      return fallback;
    };

    const wait = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    const isNativeId = (value: unknown) =>
      /^\d{5,}(_\d{5,})?$/.test(String(value ?? "").trim());

    const verifyPublishedPost = async (
      platform: string,
      nativeId: string | null,
      ayrshareId: string | null,
    ) => {
      if (scheduledIso) {
        return {
          verified: true,
          method: "scheduled",
          status: 202,
          payload: null as any,
        };
      }
      if (!nativeId && !ayrshareId) {
        return {
          verified: false,
          method: "missing_id",
          status: 0,
          payload: null as any,
        };
      }

      const attempts: Array<{ method: string; status: number; payload: any }> =
        [];
      const call = async (
        method: string,
        url: string,
        body: Record<string, unknown>,
      ) => {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${AYRSHARE_API_KEY}`,
            "Profile-Key": profileKey,
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
          },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        let payload: any = {};
        try {
          payload = text ? JSON.parse(text) : {};
        } catch {
          payload = { rawText: text };
        }
        attempts.push({ method, status: res.status, payload });
        return { ok: res.ok, status: res.status, payload };
      };
      const callHistory = async () => {
        if (platform !== "facebook" || !nativeId) {
          return { ok: false, status: 0, payload: null as any };
        }
        const qs = new URLSearchParams({
          limit: "25",
          dataType: "posts",
          skipAnalytics: "true",
        });
        const res = await fetch(
          `https://api.ayrshare.com/api/history/facebook?${qs.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${AYRSHARE_API_KEY}`,
              "Cache-Control": "no-cache",
            },
          },
        );
        const text = await res.text();
        let payload: any = {};
        try {
          payload = text ? JSON.parse(text) : {};
        } catch {
          payload = { rawText: text };
        }
        attempts.push({
          method: "history/facebook",
          status: res.status,
          payload: res.ok ? { scanned: true } : payload,
        });
        const items: any[] = Array.isArray(payload)
          ? payload
          : (payload.posts || payload.history || payload.data || []);
        const found = items.some((it) => {
          const ids = [
            it?.fbId,
            it?.postId,
            it?.post_id,
            it?.platforms?.facebook?.id,
            it?.postIds?.facebook,
          ];
          if (Array.isArray(it?.postIds)) {
            ids.push(
              ...it.postIds.map((p: any) => p?.id ?? p?.postId ?? p?.post_id),
            );
          }
          return ids.map((v) => String(v ?? "").trim()).includes(nativeId);
        });
        return { ok: res.ok && found, status: res.status, payload };
      };

      for (let i = 0; i < 3; i++) {
        if (i > 0) await wait(900);
        const history = await callHistory();
        if (history.ok) {
          return {
            verified: true,
            method: "history/facebook",
            status: history.status,
            payload: { found: true },
          };
        }
        if (nativeId) {
          const social = await call(
            "analytics/social",
            "https://api.ayrshare.com/api/analytics/social",
            { id: nativeId, platform },
          );
          if (social.ok) {
            return {
              verified: true,
              method: "analytics/social",
              status: social.status,
              payload: social.payload,
            };
          }
        }
        if (ayrshareId) {
          const post = await call(
            "analytics/post",
            "https://api.ayrshare.com/api/analytics/post",
            { id: ayrshareId, platforms: [platform] },
          );
          if (post.ok) {
            return {
              verified: true,
              method: "analytics/post",
              status: post.status,
              payload: post.payload,
            };
          }
        }
      }
      return {
        verified: false,
        method: "verification_failed",
        status: attempts.at(-1)?.status ?? 0,
        payload: { attempts },
      };
    };

    // Fire a single Ayrshare /post call. Used for the main page post and for
    // each selected Facebook Group fan-out target.
    const firePost = async (extra: Record<string, unknown>, label: string) => {
      const payload: Record<string, unknown> = {
        post: finalPostText,
        platforms: extra.platforms ?? platforms,
        profileKey,
        ...(targetAccountRef
          ? { faceBookOptions: { pageId: targetAccountRef } }
          : {}),
        ...extra,
      };
      if (resolvedMedia.length) payload.mediaUrls = resolvedMedia;
      if (firstComment) payload.firstComment = firstComment;
      if (scheduledIso) payload.scheduleDate = scheduledIso;
      console.log(`[ayrshare-post] outbound (${label})`, {
        platforms: payload.platforms,
        mediaCount: resolvedMedia.length,
        scheduleDate: scheduledIso,
        groupId: (payload as any)?.faceBookOptions?.groupId ?? null,
      });
      const guard = await guardOutboundAction({
        admin,
        actionType: "post",
        platform: Array.isArray(payload.platforms) ? String((payload.platforms as any[])[0] ?? "") : undefined,
        content: finalPostText,
      });
      if (!guard.allowed) {
        console.warn(`[ayrshare-post] BLOCKED by safety guard (${label}): ${guard.reason}`);
        return { ok: false, status: 429, body: { blocked: true, reason: guard.reason }, errors: [{ code: "safety_guard", message: guard.reason ?? "blocked" }] };
      }
      const r = await fetch(AYR_POST_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const t = await r.text();
      let j: any = null;
      try {
        j = t ? JSON.parse(t) : null;
      } catch {
        j = { raw: t };
      }
      const errs = collectErrors(j);
      const ok = r.ok && errs.length === 0;
      if (ok) {
        await recordAyrshareAction(admin, {
          actionType: "post",
          platform: Array.isArray(payload.platforms) ? String((payload.platforms as any[])[0] ?? "") : undefined,
          content: finalPostText,
          contentHash: guard.contentHash,
        });
      } else {
        // Trip circuit on suspension / rate-limit so we stop hammering Ayrshare.
        const errCode = errs[0]?.code ?? j?.code;
        const errMsg = errs[0]?.message ?? j?.message ?? j?.error;
        await tripOnAyrshareFailure(admin, r.status, { code: errCode, message: errMsg, raw: j }, `post:${label}`);
      }
      return { ok, status: r.status, body: j, errors: errs };
    };

    // ---- Main page post (skipped only when caller targets groups exclusively
    // by selecting facebook + at least one group AND explicitly setting
    // skip_page=true. Default = post to the page too).
    const skipPagePost: boolean = !!body?.skip_page && groupIds.length > 0;
    let ayrRes = {
      ok: true,
      status: 200,
      body: null as any,
      errors: [] as any[],
    };
    if (!skipPagePost) {
      ayrRes = await firePost({}, "page");
      if (!ayrRes.ok) {
        const first = ayrRes.errors[0] ?? {};
        const rawMsg = first?.message ?? ayrRes.body?.errors?.[0]?.message ??
          ayrRes.body?.message ?? `Ayrshare ${ayrRes.status}`;
        const code = first?.code ?? ayrRes.body?.code;
        if (
          isAyrshareInvalidProfileKey(ayrRes.status, {
            ...ayrRes.body,
            code,
            message: rawMsg,
          })
        ) {
          await clearStaleAyrshareConnection(
            admin,
            "Ayrshare profile rejected during post publish",
          );
          return json({
            success: false,
            error: MISSING_TENANT_KEY,
            message: MISSING_TENANT_KEY_MESSAGE,
          }, 200);
        }
        return json(providerFailure(
          ayrRes.status,
          ayrRes.body,
          ayrRes.errors,
          friendlyFromCode(code, rawMsg),
        ), 200);
      }
    }
    const ayrJson = ayrRes.body;

    // ---- Facebook Group fan-out — one Ayrshare /post per selected group.
    const groupResults: Array<
      { group_id: string; ok: boolean; id: string | null; error: string | null }
    > = [];
    for (const groupId of groupIds) {
      const r = await firePost(
        { platforms: ["facebook"], faceBookOptions: { groupId } },
        `group:${groupId}`,
      );
      const rawIds: any[] = Array.isArray(r.body?.postIds)
        ? r.body.postIds
        : Array.isArray(r.body?.posts)
        ? r.body.posts.flatMap((p: any) =>
          Array.isArray(p?.postIds) ? p.postIds : []
        )
        : [];
      const firstId = rawIds[0]?.id ?? rawIds[0]?.postId ?? null;
      const firstErr = r.errors[0] ?? null;
      groupResults.push({
        group_id: groupId,
        ok: r.ok,
        id: firstId,
        error: firstErr
          ? friendlyFromCode(
            firstErr.code,
            firstErr.message ?? `Ayrshare ${r.status}`,
          )
          : (r.ok ? null : `Ayrshare ${r.status}`),
      });
    }
    const groupFailures = groupResults.filter((g) => !g.ok);

    // Per-platform results from main page post.
    const ayrshareTopId: string | null = typeof ayrJson?.id === "string"
      ? ayrJson.id
      : Array.isArray(ayrJson?.posts) &&
          typeof ayrJson.posts[0]?.id === "string"
      ? ayrJson.posts[0].id
      : null;
    const rawPostIds: any[] = Array.isArray(ayrJson?.postIds)
      ? ayrJson.postIds
      : Array.isArray(ayrJson?.posts)
      ? ayrJson.posts.flatMap((p: any) =>
        Array.isArray(p?.postIds) ? p.postIds : []
      )
      : [];
    const postIds: Array<
      {
        platform: string;
        id: string | null;
        status: string | null;
        verified?: boolean;
        verify_method?: string | null;
      }
    > = rawPostIds.map((p: any) => ({
      platform: String(p?.platform ?? "").toLowerCase(),
      id: p?.id ?? p?.postId ?? null,
      status: p?.status ?? null,
    }));

    const verificationResults: Array<
      {
        platform: string;
        id: string | null;
        verified: boolean;
        method: string | null;
        status: number;
        payload?: any;
      }
    > = [];
    if (!skipPagePost) {
      for (const platform of platforms) {
        const match = postIds.find((p) => p.platform === platform);
        const nativeId = match?.id ? String(match.id) : null;
        const verify = await verifyPublishedPost(
          platform,
          nativeId,
          ayrshareTopId,
        );
        verificationResults.push({
          platform,
          id: nativeId,
          verified: verify.verified,
          method: verify.method,
          status: verify.status,
          payload: verify.payload,
        });
        if (match) {
          match.verified = verify.verified;
          match.verify_method = verify.method;
        }
      }
      const failedVerification = verificationResults.find((v) =>
        !v.verified || !v.id || (v.id && !isNativeId(v.id))
      );
      if (failedVerification && !scheduledIso) {
        const failureRows = rawChannels.map((ch) => ({
          user_id: ownerUserId,
          campaign_name: campaignName,
          channel: String(ch).toLowerCase(),
          message_body: finalPostText,
          status: "failed",
          provider_message_id: null,
          provider_response: {
            ayrshare: ayrJson ?? {},
            verification_results: verificationResults,
            error: "facebook_publish_not_verified",
          },
          sent_at: new Date().toISOString(),
          source_account: "ayrshare",
        } as any));
        await admin.from("campaign_logs").insert(failureRows);
        return json({
          success: false,
          error: "facebook_publish_not_verified",
          message:
            "פייסבוק לא אישר שהפוסט באמת פורסם בדף. לא סימנתי אותו כנשלח.",
          published_channels: platforms,
          post_ids: postIds,
          verification_results: verificationResults,
          ayrshare: ayrJson,
        }, 200);
      }
    }

    // One campaign_logs row per requested internal channel (page post) plus
    // one per fanned-out Facebook Group.
    const baseRows = skipPagePost ? [] : rawChannels.map((ch) => {
      const lc = String(ch).toLowerCase();
      const mapped = PLATFORM_MAP[lc];
      const match = postIds.find((p) => p.platform === mapped);
      return {
        user_id: ownerUserId,
        campaign_name: campaignName,
        channel: lc,
        message_body: finalPostText,
        status: scheduledIso
          ? "scheduled"
          : (match?.verified ? "sent" : "failed"),
        provider_message_id: match?.id ?? null,
        provider_response: {
          ...(ayrJson ?? {}),
          verification_results: verificationResults,
        },
        sent_at: scheduledIso ?? new Date().toISOString(),
        source_account: "ayrshare",
      } as any;
    });
    const groupRows = groupResults.map((g) => ({
      user_id: ownerUserId,
      campaign_name: `${campaignName} · קבוצה`,
      channel: "facebook",
      message_body: finalPostText,
      status: g.ok ? (scheduledIso ? "scheduled" : "sent") : "failed",
      provider_message_id: g.id,
      provider_response: { group_id: g.group_id, error: g.error },
      sent_at: scheduledIso ?? new Date().toISOString(),
      source_account: "ayrshare-group",
    } as any));

    const rows = [...baseRows, ...groupRows];
    if (rows.length > 0) {
      const { error: insErr } = await admin.from("campaign_logs").insert(rows);
      if (insErr) {
        console.warn(
          "[ayrshare-post] campaign_logs insert error",
          insErr.message,
        );
      }
    }

    return json({
      success: groupFailures.length === 0,
      published_channels: platforms,
      post_ids: postIds,
      verified: scheduledIso
        ? true
        : verificationResults.every((v) => v.verified),
      verification_results: verificationResults,
      group_results: groupResults,
      group_failures: groupFailures,
      ayrshare: ayrJson,
      listing_id: listingId,
    });
  } catch (e) {
    console.error("[ayrshare-post] error:", e);
    return json({
      success: false,
      error: "service_failed",
      message: e instanceof Error ? e.message : "שגיאת פרסום לא צפויה. נסה שוב מאוחר יותר.",
    }, 200);
  }
});

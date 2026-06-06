// Realtyz ayrshare-post — publishes a campaign post to one or more social
// channels via the workspace's Ayrshare profile, then writes one row per
// channel into campaign_logs scoped to the owning user_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveWorkspaceProfileKey } from "../_shared/ayrshare-helpers.ts";

const AYR_POST_URL = "https://api.ayrshare.com/api/post";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  try {
    const AYRSHARE_API_KEY = Deno.env.get("AYRSHARE_API_KEY");
    if (!AYRSHARE_API_KEY) return json({ error: "AYRSHARE_API_KEY not configured" }, 500);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const postText: string = String(body?.post ?? body?.message ?? "").trim();
    const rawChannels: string[] = Array.isArray(body?.channels) ? body.channels : [];
    const campaignName: string = String(body?.campaign_name ?? "Campaign");
    const rawMediaInput: unknown[] = Array.isArray(body?.media_urls) ? body.media_urls.filter(Boolean) : [];
    const listingId: string | null = body?.listing_id ?? null;
    const scheduledAtRaw: string | null = typeof body?.scheduled_at === "string" ? body.scheduled_at : null;
    const groupIds: string[] = Array.isArray(body?.group_ids)
      ? body.group_ids.map((g: unknown) => String(g ?? "").trim()).filter(Boolean)
      : [];
    let scheduledIso: string | null = null;
    if (scheduledAtRaw) {
      const d = new Date(scheduledAtRaw);
      if (Number.isNaN(d.getTime())) return json({ error: "invalid scheduled_at" }, 400);
      if (d.getTime() <= Date.now() + 30_000) return json({ error: "scheduled_at must be in the future" }, 400);
      scheduledIso = d.toISOString();
    }

    if (!postText) return json({ error: "missing post text" }, 400);
    if (rawChannels.length === 0) return json({ error: "no channels selected" }, 400);

    // Resolve caller from Authorization header (user_id isolation)
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: authData } = await admin.auth.getUser(token);
    const userId = authData?.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const platforms = Array.from(
      new Set(rawChannels.map((c) => PLATFORM_MAP[String(c).toLowerCase()]).filter(Boolean)),
    );
    if (platforms.length === 0) {
      return json({ error: "no supported social channels in selection" }, 400);
    }

    const { profileKey } = await resolveWorkspaceProfileKey(admin);
    if (!profileKey) return json({ error: "workspace ayrshare profile key missing" }, 500);

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
        if (typeof obj.url === "string" && /^https?:\/\//i.test(obj.url)) return obj.url;
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
        const { data } = admin.storage.from(maybeBucket).getPublicUrl(rest.join("/"));
        return data?.publicUrl ?? null;
      }
      // Pure storage path with no bucket prefix — default to media-library.
      const { data } = admin.storage.from("media-library").getPublicUrl(s);
      return data?.publicUrl ?? null;
    };

    const resolvedMedia = (
      await Promise.all(rawMediaInput.map((m) => resolvePublicUrl(m)))
    ).filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u));

    // Emergency guard: if the caller intended to attach media but every entry
    // failed to resolve to a public URL, refuse to publish a broken text-only
    // ad rather than silently dropping the images.
    if (rawMediaInput.length > 0 && resolvedMedia.length === 0) {
      console.error("[ayrshare-post] media-resolution failure", { rawMediaInput });
      return json({
        error: "כל התמונות שצורפו אינן זמינות ככתובת ציבורית. העלה את התמונות לספריית המדיה ונסה שוב.",
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
    const friendlyFromCode = (code: number | string | undefined, fallback: string): string => {
      const c = Number(code);
      if (c === 137) {
        return 'פייסבוק חוסם פרסום של תוכן זהה תוך 48 שעות. שנה מעט את הכיתוב (כותרת, אימוג׳י או משפט פתיחה) ונסה שוב.';
      }
      if (c === 156 || c === 155) return 'פג תוקף החיבור לפייסבוק. חבר את הדף מחדש מהגדרות ערוצים.';
      return fallback;
    };

    // Fire a single Ayrshare /post call. Used for the main page post and for
    // each selected Facebook Group fan-out target.
    const firePost = async (extra: Record<string, unknown>, label: string) => {
      const payload: Record<string, unknown> = {
        post: postText,
        platforms: extra.platforms ?? platforms,
        profileKey,
        ...extra,
      };
      if (resolvedMedia.length) payload.mediaUrls = resolvedMedia;
      if (scheduledIso) payload.scheduleDate = scheduledIso;
      console.log(`[ayrshare-post] outbound (${label})`, {
        platforms: payload.platforms,
        mediaCount: resolvedMedia.length,
        scheduleDate: scheduledIso,
        groupId: (payload as any)?.faceBookOptions?.groupId ?? null,
      });
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
      try { j = t ? JSON.parse(t) : null; } catch { j = { raw: t }; }
      const errs = collectErrors(j);
      return { ok: r.ok && errs.length === 0, status: r.status, body: j, errors: errs };
    };

    // ---- Main page post (skipped only when caller targets groups exclusively
    // by selecting facebook + at least one group AND explicitly setting
    // skip_page=true. Default = post to the page too).
    const skipPagePost: boolean = !!body?.skip_page && groupIds.length > 0;
    let ayrRes = { ok: true, status: 200, body: null as any, errors: [] as any[] };
    if (!skipPagePost) {
      ayrRes = await firePost({}, "page");
      if (!ayrRes.ok) {
        const first = ayrRes.errors[0] ?? {};
        const rawMsg = first?.message ?? ayrRes.body?.errors?.[0]?.message ?? ayrRes.body?.message ?? `Ayrshare ${ayrRes.status}`;
        const code = first?.code ?? ayrRes.body?.code;
        return json({ error: friendlyFromCode(code, rawMsg), code: code ?? null, status: ayrRes.status, details: ayrRes.body }, 502);
      }
    }
    const ayrJson = ayrRes.body;

    // ---- Facebook Group fan-out — one Ayrshare /post per selected group.
    const groupResults: Array<{ group_id: string; ok: boolean; id: string | null; error: string | null }> = [];
    for (const groupId of groupIds) {
      const r = await firePost(
        { platforms: ["facebook"], faceBookOptions: { groupId } },
        `group:${groupId}`,
      );
      const rawIds: any[] = Array.isArray(r.body?.postIds)
        ? r.body.postIds
        : Array.isArray(r.body?.posts)
          ? r.body.posts.flatMap((p: any) => Array.isArray(p?.postIds) ? p.postIds : [])
          : [];
      const firstId = rawIds[0]?.id ?? rawIds[0]?.postId ?? null;
      const firstErr = r.errors[0] ?? null;
      groupResults.push({
        group_id: groupId,
        ok: r.ok,
        id: firstId,
        error: firstErr ? friendlyFromCode(firstErr.code, firstErr.message ?? `Ayrshare ${r.status}`) : (r.ok ? null : `Ayrshare ${r.status}`),
      });
    }
    const groupFailures = groupResults.filter((g) => !g.ok);

    // Per-platform results from main page post.
    const rawPostIds: any[] = Array.isArray(ayrJson?.postIds)
      ? ayrJson.postIds
      : Array.isArray(ayrJson?.posts)
        ? ayrJson.posts.flatMap((p: any) => Array.isArray(p?.postIds) ? p.postIds : [])
        : [];
    const postIds: Array<{ platform: string; id: string | null; status: string | null }> =
      rawPostIds.map((p: any) => ({
        platform: String(p?.platform ?? "").toLowerCase(),
        id: p?.id ?? p?.postId ?? null,
        status: p?.status ?? null,
      }));

    // One campaign_logs row per requested internal channel (page post) plus
    // one per fanned-out Facebook Group.
    const baseRows = skipPagePost ? [] : rawChannels.map((ch) => {
      const lc = String(ch).toLowerCase();
      const mapped = PLATFORM_MAP[lc];
      const match = postIds.find((p) => p.platform === mapped);
      return {
        user_id: userId,
        campaign_name: campaignName,
        channel: lc,
        message_body: postText,
        status: scheduledIso ? "scheduled" : (match?.status === "success" || ayrRes.ok ? "sent" : "queued"),
        provider_message_id: match?.id ?? null,
        provider_response: ayrJson ?? {},
        sent_at: scheduledIso ?? new Date().toISOString(),
        source_account: "ayrshare",
      } as any;
    });
    const groupRows = groupResults.map((g) => ({
      user_id: userId,
      campaign_name: `${campaignName} · קבוצה`,
      channel: "facebook",
      message_body: postText,
      status: g.ok ? (scheduledIso ? "scheduled" : "sent") : "failed",
      provider_message_id: g.id,
      provider_response: { group_id: g.group_id, error: g.error },
      sent_at: scheduledIso ?? new Date().toISOString(),
      source_account: "ayrshare-group",
    } as any));

    const rows = [...baseRows, ...groupRows];
    if (rows.length > 0) {
      const { error: insErr } = await admin.from("campaign_logs").insert(rows);
      if (insErr) console.warn("[ayrshare-post] campaign_logs insert error", insErr.message);
    }

    return json({
      success: groupFailures.length === 0,
      published_channels: platforms,
      post_ids: postIds,
      group_results: groupResults,
      group_failures: groupFailures,
      ayrshare: ayrJson,
      listing_id: listingId,
    });
  } catch (e) {
    console.error("[ayrshare-post] error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

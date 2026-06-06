// Realtyz ayrshare-analytics — fetches live per-post analytics (likes,
// comments, shares, views) from Ayrshare for every published campaign_log
// belonging to the caller, and writes the counters back to campaign_logs so
// the UI can show them live.
//
// Strict isolation: caller must be authenticated; only the caller's rows are
// queried/updated. Workspace Profile-Key comes from workspace_social_profile.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { AYR_BASE, resolveWorkspaceProfileKey } from "../_shared/ayrshare-helpers.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Internal channel id -> Ayrshare platform id
const PLATFORM_MAP: Record<string, string> = {
  facebook: "facebook",
  instagram: "instagram",
  x: "twitter",
  twitter: "twitter",
  linkedin: "linkedin",
  youtube: "youtube",
  tiktok: "tiktok",
};

type Counts = { likes: number; comments: number; shares: number; views: number };

function pickNum(...vals: unknown[]): number {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.trunc(v));
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
      return Math.max(0, Math.trunc(Number(v)));
    }
  }
  return 0;
}

function extractCounts(analytics: any, platform: string): Counts {
  // Ayrshare returns shape like { facebook: { analytics: {...} } } or
  // { facebook: {...} }, plus sometimes top-level { analytics: ... }.
  const root =
    analytics?.[platform]?.analytics ??
    analytics?.[platform] ??
    analytics?.analytics ??
    analytics ?? {};
  const likes = pickNum(
    root.likeCount, root.likes, root.reactionsCount, root.reactions,
    root.favoriteCount, root.favorites, root.heartCount,
    root.likeAndReactionCount,
  );
  const comments = pickNum(
    root.commentsCount, root.commentCount, root.comments, root.replyCount,
  );
  const shares = pickNum(
    root.shareCount, root.shares, root.sharesCount, root.retweetCount,
    root.repostCount, root.reshareCount,
  );
  const views = pickNum(
    root.impressionCount, root.impressions, root.viewCount, root.views,
    root.videoViews, root.playCount, root.reach,
  );
  return { likes, comments, shares, views };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const AYRSHARE_API_KEY = Deno.env.get("AYRSHARE_API_KEY");
  if (!AYRSHARE_API_KEY) return json({ error: "AYRSHARE_API_KEY not configured" }, 500);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data: authData } = await admin.auth.getUser(token);
  const userId = authData?.user?.id;
  if (!userId) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(200, Math.max(1, Number(body?.limit) || 100));

  const { profileKey } = await resolveWorkspaceProfileKey(admin);
  if (!profileKey) return json({ error: "workspace ayrshare profile key missing" }, 400);

  // Pull caller's recent social campaign logs that have a native post id.
  const { data: rows, error } = await admin
    .from("campaign_logs")
    .select("id, channel, provider_message_id, provider_response, created_at")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return json({ error: error.message }, 500);

  const targets: { id: string; platform: string; postId: string; needsBackfill: boolean }[] = [];
  for (const r of rows ?? []) {
    const ch = String((r as any).channel || "").toLowerCase();
    const platform = PLATFORM_MAP[ch];
    if (!platform) continue;
    const pr: any = (r as any).provider_response ?? {};
    // Ayrshare returns one of:
    //   { id, postIds: [{ platform, id, postUrl }, ...] }              (flat)
    //   { posts: [{ id, postIds: [{ platform, id, postUrl }, ...] }] } (wrapped)
    const flatPostIds: any[] = Array.isArray(pr?.postIds) ? pr.postIds : [];
    const wrappedPostIds: any[] = Array.isArray(pr?.posts)
      ? pr.posts.flatMap((p: any) => Array.isArray(p?.postIds) ? p.postIds : [])
      : [];
    const allPostIds = [...flatPostIds, ...wrappedPostIds];
    const platformMatch = allPostIds.find(
      (p: any) => String(p?.platform || "").toLowerCase() === platform,
    );
    const ayrId =
      platformMatch?.id ||
      allPostIds[0]?.id ||
      (typeof pr?.id === "string" && pr.id) ||
      (Array.isArray(pr?.posts) && typeof pr.posts[0]?.id === "string" && pr.posts[0].id) ||
      (r as any).provider_message_id ||
      null;
    if (!ayrId) continue;
    targets.push({
      id: (r as any).id,
      platform,
      postId: String(ayrId),
      needsBackfill: !(r as any).provider_message_id,
    });
  }

  const results = await Promise.allSettled(
    targets.map(async (t) => {
      const res = await fetch(`${AYR_BASE}/analytics/post`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AYRSHARE_API_KEY}`,
          "Profile-Key": profileKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: t.postId, platforms: [t.platform] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { id: t.id, ok: false, status: res.status, error: j?.message || j?.error || res.statusText };
      }
      const counts = extractCounts(j, t.platform);
      await admin
        .from("campaign_logs")
        .update({
          like_count: counts.likes,
          comment_count: counts.comments,
          share_count: counts.shares,
          view_count: counts.views,
          metrics_updated_at: new Date().toISOString(),
          ...(t.needsBackfill ? { provider_message_id: t.postId } : {}),
        })
        .eq("id", t.id)
        .eq("user_id", userId);
      return { id: t.id, ok: true, counts };
    }),
  );

  return json({
    success: true,
    targets: targets.length,
    updated: results.filter((r) => r.status === "fulfilled" && (r as any).value?.ok).length,
    results: results.map((r) => (r.status === "fulfilled" ? r.value : { ok: false, error: String((r as any).reason) })),
  });
});

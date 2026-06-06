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
    const mediaUrls: string[] = Array.isArray(body?.media_urls) ? body.media_urls.filter(Boolean) : [];
    const listingId: string | null = body?.listing_id ?? null;

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

    const ayrPayload: Record<string, unknown> = {
      post: postText,
      platforms,
      profileKey,
    };
    if (mediaUrls.length) ayrPayload.mediaUrls = mediaUrls;

    const ayrRes = await fetch(AYR_POST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AYRSHARE_API_KEY}`,
        "Profile-Key": profileKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(ayrPayload),
    });
    const ayrText = await ayrRes.text();
    let ayrJson: any = null;
    try { ayrJson = ayrText ? JSON.parse(ayrText) : null; } catch { ayrJson = { raw: ayrText }; }

    if (!ayrRes.ok) {
      console.error("[ayrshare-post] failed", ayrRes.status, ayrJson);
      const msg = ayrJson?.errors?.[0]?.message ?? ayrJson?.message ?? `Ayrshare ${ayrRes.status}`;
      return json({ error: msg, status: ayrRes.status, details: ayrJson }, 502);
    }

    // Per-platform results from Ayrshare
    const postIds: Array<{ platform: string; id: string | null; status: string | null }> =
      Array.isArray(ayrJson?.postIds)
        ? ayrJson.postIds.map((p: any) => ({
            platform: String(p?.platform ?? "").toLowerCase(),
            id: p?.id ?? p?.postId ?? null,
            status: p?.status ?? null,
          }))
        : [];

    // One campaign_logs row per requested internal channel
    const rows = rawChannels.map((ch) => {
      const lc = String(ch).toLowerCase();
      const mapped = PLATFORM_MAP[lc];
      const match = postIds.find((p) => p.platform === mapped);
      return {
        user_id: userId,
        campaign_name: campaignName,
        channel: lc,
        message_body: postText,
        status: match?.status === "success" || ayrRes.ok ? "sent" : "queued",
        provider_message_id: match?.id ?? null,
        provider_response: ayrJson ?? {},
        sent_at: new Date().toISOString(),
        source_account: "ayrshare",
      } as any;
    });

    const { error: insErr } = await admin.from("campaign_logs").insert(rows);
    if (insErr) console.warn("[ayrshare-post] campaign_logs insert error", insErr.message);

    return json({
      success: true,
      published_channels: platforms,
      post_ids: postIds,
      ayrshare: ayrJson,
      listing_id: listingId,
    });
  } catch (e) {
    console.error("[ayrshare-post] error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

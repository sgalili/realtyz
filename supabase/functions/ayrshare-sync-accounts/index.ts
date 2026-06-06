// Pulls linked sub-accounts/pages from Ayrshare's /user endpoint for the
// SINGLETON RZ workspace profile and upserts them into
// public.ayrshare_social_accounts. Also mirrors the linked platform set into
// public.social_connections so the inbox composer + grid update immediately.
//
// RZ ISOLATION: reads workspace_social_profile.ayrshare_profile_key (the key
// is dynamically provisioned via ayrshare-social-link). NEVER falls back to
// a hardcoded/external key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AYR_BASE = "https://api.ayrshare.com/api";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type PageEntry = {
  platform: string;
  account_ref: string;
  display_name: string | null;
  username: string | null;
  account_type: string | null;
  avatar_url: string | null;
  profile_url: string | null;
  metadata: Record<string, unknown>;
};

function extractAccounts(userBody: any): PageEntry[] {
  const out: PageEntry[] = [];
  const seen = new Set<string>();
  const push = (e: PageEntry) => {
    const k = `${e.platform}:${e.account_ref}`;
    if (seen.has(k) || !e.account_ref) return;
    seen.add(k);
    out.push(e);
  };

  const displayNames = Array.isArray(userBody?.displayNames) ? userBody.displayNames : [];
  for (const d of displayNames) {
    const rawP = String(d?.platform ?? "").toLowerCase();
    if (!rawP) continue;
    const platform = rawP === "twitter" ? "x" : rawP;
    const ref = String(
      d?.id ?? d?.pageId ?? d?.organizationId ?? d?.userName ?? d?.userId ?? d?.handle ?? d?.urn ?? "",
    ).trim();
    if (!ref) continue;
    push({
      platform,
      account_ref: ref,
      display_name: d?.displayName ?? d?.title ?? d?.name ?? d?.userName ?? null,
      username: d?.userName ?? d?.username ?? null,
      account_type: d?.type ?? d?.kind ?? null,
      avatar_url: d?.profileImage ?? d?.avatar ?? d?.image ?? null,
      profile_url: d?.url ?? d?.profileUrl ?? null,
      metadata: { source: "displayNames", raw: d },
    });
  }

  const buckets: Array<{ platform: string; key: string }> = [
    { platform: "facebook", key: "facebookPageDetails" },
    { platform: "facebook", key: "facebookPages" },
    { platform: "instagram", key: "instagramAccounts" },
    { platform: "linkedin", key: "linkedInOrgDetails" },
    { platform: "linkedin", key: "linkedInPages" },
    { platform: "gmb", key: "gmbLocations" },
    { platform: "youtube", key: "youtubeChannels" },
    { platform: "pinterest", key: "pinterestBoards" },
  ];
  for (const { platform, key } of buckets) {
    const list = Array.isArray(userBody?.[key]) ? userBody[key] : [];
    for (const p of list) {
      const ref = String(
        p?.id ?? p?.pageId ?? p?.organizationId ?? p?.locationId ?? p?.channelId ?? p?.urn ?? "",
      ).trim();
      if (!ref) continue;
      push({
        platform,
        account_ref: ref,
        display_name: p?.name ?? p?.displayName ?? p?.title ?? null,
        username: p?.username ?? p?.userName ?? null,
        account_type: p?.type ?? p?.category ?? "page",
        avatar_url: p?.picture ?? p?.image ?? p?.avatar ?? null,
        profile_url: p?.url ?? null,
        metadata: { source: key, raw: p },
      });
    }
  }

  const active = Array.isArray(userBody?.activeSocialAccounts) ? userBody.activeSocialAccounts : [];
  for (const raw of active) {
    const rawP = String(raw ?? "").toLowerCase();
    if (!rawP) continue;
    const platform = rawP === "twitter" ? "x" : rawP;
    if (out.some((e) => e.platform === platform)) continue;
    push({
      platform,
      account_ref: `default:${platform}`,
      display_name: null,
      username: null,
      account_type: "primary",
      avatar_url: null,
      profile_url: null,
      metadata: { source: "activeSocialAccounts" },
    });
  }

  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("AYRSHARE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!apiKey) return json({ error: "AYRSHARE_API_KEY not configured" }, 500);

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing auth" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: claims, error: claimsErr } = await admin.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Invalid auth" }, 401);
    const userId = claims.claims.sub as string;

    const { data: ws } = await admin
      .from("workspace_social_profile")
      .select("ayrshare_profile_key")
      .maybeSingle();

    const profileKey = (ws?.ayrshare_profile_key as string | null)?.trim();
    if (!profileKey) {
      return json({ accounts: [], synced: 0, reason: "no_workspace_profile_key" });
    }

    let ayrBody: any = {};
    let ayrOk = false;
    try {
      const r = await fetch(`${AYR_BASE}/user`, {
        headers: { Authorization: `Bearer ${apiKey}`, "Profile-Key": profileKey },
      });
      ayrBody = await r.json().catch(() => ({}));
      ayrOk = r.ok;
      if (!ayrOk) console.warn("[ayrshare-sync-accounts] /user failed", r.status, ayrBody);
    } catch (e) {
      console.warn("[ayrshare-sync-accounts] /user network error", e);
    }
    if (!ayrOk) {
      return json({ accounts: [], synced: 0, reason: "ayrshare_rejected", details: ayrBody });
    }

    const accounts = extractAccounts(ayrBody);
    const now = new Date().toISOString();

    if (accounts.length > 0) {
      const rows = accounts.map((a) => ({
        user_id: userId,
        platform: a.platform,
        profile_key: profileKey,
        account_ref: a.account_ref,
        display_name: a.display_name,
        username: a.username,
        account_username: a.username,
        account_type: a.account_type,
        avatar_url: a.avatar_url,
        profile_url: a.profile_url,
        connected: true,
        is_active: true,
        metadata: a.metadata,
        last_synced_at: now,
        updated_at: now,
      }));
      const { error: upErr } = await admin
        .from("ayrshare_social_accounts")
        .upsert(rows, { onConflict: "user_id,platform,account_ref" });
      if (upErr) {
        console.error("[ayrshare-sync-accounts] upsert error", upErr);
        return json({ error: upErr.message }, 500);
      }

      // Never disconnect cached accounts during background sync. Ayrshare can
      // return partial account lists after refresh/re-entry; only an explicit
      // user disconnect action should mark a platform inactive.
    }

    // Mirror to workspace-wide social_connections
    try {
      const active: string[] = Array.isArray(ayrBody?.activeSocialAccounts)
        ? ayrBody.activeSocialAccounts.map((x: any) => String(x || "").toLowerCase()).filter(Boolean)
        : [];
      const normalize = (p: string) => {
        if (p === "x") return "twitter";
        if (p === "youtubeshorts") return "youtube";
        return p;
      };
      const linked = new Set<string>(active.map(normalize));
      for (const a of accounts) linked.add(normalize(a.platform));

      const AYR_MANAGED = new Set([
        "facebook", "instagram", "twitter", "tiktok", "linkedin",
        "youtube", "pinterest", "threads", "snapchat", "reddit",
        "bluesky", "telegram", "gmb",
      ]);

      if (linked.size > 0) {
        const rows = Array.from(linked).map((platform) => ({
          platform,
          display_name: platform.charAt(0).toUpperCase() + platform.slice(1),
          is_connected: true,
          last_test_status: "ok",
          last_test_message: "Linked via Ayrshare",
          last_test_at: now,
          connected_at: now,
          created_by: userId,
          updated_at: now,
        }));
        const { error: scErr } = await admin
          .from("social_connections")
          .upsert(rows, { onConflict: "platform" });
        if (scErr) console.error("[ayrshare-sync-accounts] social_connections upsert failed", scErr);
      }

      // Do not auto-disconnect platforms missing from this sync response.
      // Connections must persist across exit/refresh until the user manually
      // asks to disconnect them.
    } catch (mirrorErr) {
      console.error("[ayrshare-sync-accounts] mirror error", mirrorErr);
    }

    return json({
      accounts,
      synced: accounts.length,
      profileKey,
      linkedPlatforms: Array.isArray(ayrBody?.activeSocialAccounts) ? ayrBody.activeSocialAccounts : [],
    });
  } catch (e) {
    console.error("[ayrshare-sync-accounts] unexpected", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

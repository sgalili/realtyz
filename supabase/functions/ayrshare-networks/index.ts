// Returns the catalog of Ayrshare-supported social networks PLUS live
// connection status for the SINGLETON RZ workspace profile. Adapted from
// Kalpiz with all multi-tenant / hardcoded test-key logic stripped to honor
// the RZ workspace isolation rule (each workspace owns its own dynamically
// provisioned ayrshare_profile_key — see workspace_social_profile).
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

type NetworkDef = {
  id: string;
  name: string;
  hint?: string;
  requiresSetup?: boolean;
  setupNote?: string;
};

const NETWORK_METADATA: Record<string, Omit<NetworkDef, "id" | "name">> = {
  instagram: { hint: "תזמון פוסטים, ריילז וסטוריז · ניהול תגובות" },
  facebook: { hint: "ניהול עמוד העסק, פרסום ותגובות" },
  twitter: { hint: "ציוצים, תשובות ומעקב טרנדים" },
  x: { hint: "ציוצים, תשובות ומעקב טרנדים" },
  linkedin: { hint: "פרסום עדכונים מקצועיים ובניית רשת" },
  tiktok: { hint: "העלאה ותזמון של סרטונים קצרים" },
  pinterest: { hint: "פיני נדל\"ן ותוכן ויזואלי" },
  threads: { hint: "שיחה אותנטית עם הקהילה" },
  youtube: { hint: "סרטוני סיור, וובינרים ועדכונים" },
  bluesky: { hint: "פלטפורמה פתוחה ועצמאית" },
  reddit: { hint: "השתתפות בקהילות וסאבראדיטים רלוונטיים" },
  gmb: {
    hint: "עדכונים בעמוד Google Business שלך",
    requiresSetup: true,
    setupNote: "דורש אימות בעלות בעמוד Google Business",
  },
};

const prettifyName = (raw: string) =>
  raw
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .replace(/^Gmb$/i, "Google Business Profile")
    .replace(/^X$/i, "X (Twitter)")
    .replace(/^Twitter$/i, "X (Twitter)");

const normalizeNetworkId = (value: string) => {
  const n = value.trim().toLowerCase();
  return n === "twitter" ? "x" : n;
};

const buildCatalogFromApi = (body: any): NetworkDef[] => {
  const items: any[] = [
    ...(Array.isArray(body) ? body : []),
    ...(Array.isArray(body?.networks) ? body.networks : []),
    ...(Array.isArray(body?.socialNetworks) ? body.socialNetworks : []),
    ...(Array.isArray(body?.availableNetworks) ? body.availableNetworks : []),
    ...(Array.isArray(body?.data) ? body.data : []),
  ];
  const seen = new Set<string>();
  const out: NetworkDef[] = [];
  for (const it of items) {
    const raw = typeof it === "string"
      ? it
      : it?.platform ?? it?.socialNetwork ?? it?.network ?? it?.name ?? it?.id ?? "";
    const id = normalizeNetworkId(String(raw || ""));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const meta = NETWORK_METADATA[id] ?? {};
    out.push({
      id,
      name: prettifyName(id),
      hint: meta.hint,
      requiresSetup: meta.requiresSetup,
      setupNote: meta.setupNote,
    });
  }
  return out;
};

const FALLBACK_CATALOG: NetworkDef[] = [
  "facebook", "instagram", "x", "linkedin", "tiktok",
  "youtube", "pinterest", "threads", "gmb", "bluesky", "reddit",
].map((id) => ({
  id,
  name: prettifyName(id),
  hint: NETWORK_METADATA[id]?.hint,
  requiresSetup: NETWORK_METADATA[id]?.requiresSetup,
  setupNote: NETWORK_METADATA[id]?.setupNote,
}));

const pickId = (v: unknown): string => {
  if (typeof v === "string") return v.trim().toLowerCase();
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return String(o.platform ?? o.socialNetwork ?? o.network ?? o.name ?? o.id ?? "").trim().toLowerCase();
  }
  return "";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("AYRSHARE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!apiKey) return json({ error: "AYRSHARE_API_KEY not configured" }, 500);

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing auth" }, 401);

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: "Invalid auth" }, 401);

    // SINGLETON workspace profile — never reuse static / external keys.
    const { data: ws } = await supabase
      .from("workspace_social_profile")
      .select("ayrshare_profile_key")
      .maybeSingle();

    const profileKey = (ws?.ayrshare_profile_key as string | null)?.trim() || "";

    // 1) Fetch dynamic networks catalog
    let catalog: NetworkDef[] = [];
    try {
      const r = await fetch(`${AYR_BASE}/profiles/v2/networks`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (r.ok) {
        const b = await r.json().catch(() => ({}));
        catalog = buildCatalogFromApi(b);
      }
    } catch (e) {
      console.warn("[ayrshare-networks] networks endpoint failed", e);
    }
    if (catalog.length === 0) catalog = FALLBACK_CATALOG;

    // 2) Live connection state for the workspace profile (if provisioned)
    let activeAccounts: string[] = [];
    const displayNames: Record<string, string> = {};
    let profileInvalidated = false;

    if (profileKey) {
      try {
        const userRes = await fetch(`${AYR_BASE}/user`, {
          headers: { Authorization: `Bearer ${apiKey}`, "Profile-Key": profileKey },
        });
        if (userRes.ok) {
          const body = await userRes.json().catch(() => ({}));
          const raw = [
            ...(Array.isArray(body?.activeSocialAccounts) ? body.activeSocialAccounts : []),
            ...(Array.isArray(body?.activeNetworks) ? body.activeNetworks : []),
          ];
          for (const item of raw) {
            const id = pickId(item);
            if (id && !activeAccounts.includes(id)) activeAccounts.push(id);
          }
          const dn = body?.displayNames;
          if (Array.isArray(dn)) {
            for (const d of dn) {
              const k = pickId(d);
              const label = d?.displayName ?? d?.userName ?? d?.name ?? null;
              if (k && label) displayNames[k] = String(label);
            }
          }
        } else {
          console.warn("[ayrshare-networks] /user non-ok", userRes.status);
          // 401/403/404 from /user means the saved profileKey was deleted or
          // suspended server-side. Wipe stale local rows so the UI flips to
          // "disconnected" and the next click runs the orphan-purge +
          // fresh-profile creation flow in ayrshare-social-link.
          if ([401, 403, 404].includes(userRes.status)) {
            profileInvalidated = true;
          }
        }
      } catch (e) {
        console.warn("[ayrshare-networks] /user fetch error", e);
      }
    }

    if (profileInvalidated) {
      console.log("[ayrshare-networks] purging stale local social rows after invalid profileKey");
      await supabase
        .from("workspace_social_profile")
        .update({
          ayrshare_profile_key: null,
          ayrshare_ref_id: null,
          facebook_page_id: null,
          facebook_page_name: null,
        })
        .neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("ayrshare_social_accounts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("social_connections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      activeAccounts = [];
    }


    const isConnected = (id: string) => {
      if (id === "x") return activeAccounts.includes("twitter") || activeAccounts.includes("x");
      if (id === "youtube") return activeAccounts.includes("youtube") || activeAccounts.includes("youtubeshorts");
      return activeAccounts.includes(id);
    };
    const accountName = (id: string): string | null => {
      if (id === "x") return displayNames["twitter"] ?? displayNames["x"] ?? null;
      if (id === "youtube") return displayNames["youtube"] ?? displayNames["youtubeshorts"] ?? null;
      return displayNames[id] ?? null;
    };

    const networks = catalog.map((n) => ({
      id: n.id,
      name: n.name,
      hint: n.hint ?? null,
      connected: isConnected(n.id),
      accountName: accountName(n.id),
      requiresSetup: !!n.requiresSetup,
      setupNote: n.setupNote ?? null,
    }));

    // Per-Page rows for the FB card multi-page selector. Fetched from the
    // local cache so the UI can render each connected Page as its own row
    // with its own avatar + display name even when several Pages live under
    // a single Ayrshare profile.
    let facebookPages: Array<{ id: string; pageId: string; name: string | null; avatarUrl: string | null }> = [];
    if (!profileInvalidated) {
      const { data: fbRows } = await supabase
        .from("ayrshare_social_accounts")
        .select("id, account_ref, display_name, avatar_url, is_active")
        .eq("platform", "facebook")
        .eq("is_active", true);
      facebookPages = (fbRows ?? [])
        .filter((r: any) => r?.account_ref)
        .map((r: any) => ({
          id: r.id,
          pageId: String(r.account_ref),
          name: r.display_name ?? null,
          avatarUrl: r.avatar_url ?? null,
        }));
    }

    return json({
      networks,
      profileKey: profileKey || null,
      provisioned: !!profileKey && !profileInvalidated,
      facebookPages,
    });
  } catch (e) {
    console.error("[ayrshare-networks] unexpected", e);
    return json({ error: e instanceof Error ? e.message : "unknown_error" }, 500);
  }
});

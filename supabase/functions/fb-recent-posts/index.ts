// Fetch recent Facebook posts from the connected Page via Ayrshare /history.
// Paginates so we return ALL posts, not just the most recent batch.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let body: any = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { body = {}; }
    }
    const lastRecords = Number(body?.lastRecords ?? url.searchParams.get("lastRecords") ?? "500");
    const pageSize = Math.min(100, Math.max(10, Number(body?.pageSize ?? 100)));
    const maxPages = Math.max(1, Math.ceil(lastRecords / pageSize));

    const KEY = Deno.env.get("AYRSHARE_API_KEY")?.trim().replace(/^["']|["']$/g, "");
    if (!KEY) throw new Error("AYRSHARE_API_KEY missing");

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: ws } = await admin
      .from("workspace_social_profile")
      .select("ayrshare_profile_key")
      .eq("id", WORKSPACE_ID)
      .maybeSingle();
    const profileKey = (ws?.ayrshare_profile_key?.toString().trim()) ||
      Deno.env.get("AYRSHARE_PROFILE_KEY")?.trim().replace(/^["']|["']$/g, "") || "";
    if (!profileKey) throw new Error("workspace ayrshare_profile_key missing");

    const seenIds = new Set<string>();
    const all: any[] = [];
    let lastStatus = 0;
    let lastError: any = null;
    let nextToken: string | null = null;

    for (let page = 0; page < maxPages; page++) {
      const qs = new URLSearchParams({ platforms: "facebook", lastRecords: String(pageSize) });
      if (nextToken) qs.set("nextToken", nextToken);
      const resp = await fetch(`https://api.ayrshare.com/api/history?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${KEY}`, "Profile-Key": profileKey },
      });
      lastStatus = resp.status;
      const json = await resp.json().catch(() => ({} as any));
      if (!resp.ok) { lastError = json; break; }
      const items: any[] = Array.isArray(json) ? json : (json.history || json.posts || json.data || []);
      if (!items.length) break;
      let added = 0;
      for (const it of items) {
        const id = it.id || it.postId || it.platforms?.facebook?.id || it.refId || JSON.stringify(it).slice(0, 64);
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        all.push(it);
        added++;
      }
      nextToken = json?.nextToken || json?.next_token || json?.pageToken || null;
      if (!nextToken && added === 0) break;
      if (!nextToken && items.length < pageSize) break;
      if (all.length >= lastRecords) break;
    }

    const posts = all.map((it: any) => ({
      id: it.id || it.postId || it.platforms?.facebook?.id || null,
      fb_post_id: it.platforms?.facebook?.id || it.postIds?.facebook || null,
      text: it.post || it.message || it.text || it.caption || "",
      created_at: it.created || it.createdAt || it.scheduleDate || null,
      status: it.status || it.platforms?.facebook?.status || null,
      url: it.platforms?.facebook?.postUrl || it.postUrl || null,
      media: it.mediaUrls || it.media || [],
    }));

    return new Response(
      JSON.stringify({ ok: true, count: posts.length, posts, raw_status: lastStatus, raw_error: lastError }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

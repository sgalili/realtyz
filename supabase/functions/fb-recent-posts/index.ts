// Fetch recent Facebook posts from the connected Page via Ayrshare /history.
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
    const lastRecords = Number(url.searchParams.get("lastRecords") ?? "20");

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

    const resp = await fetch(
      `https://api.ayrshare.com/api/history?platforms=facebook&lastRecords=${lastRecords}`,
      { headers: { Authorization: `Bearer ${KEY}`, "Profile-Key": profileKey } },
    );
    const json = await resp.json().catch(() => ({} as any));
    const items: any[] = Array.isArray(json) ? json : (json.history || json.posts || json.data || []);

    const posts = items.map((it: any) => ({
      id: it.id || it.postId || it.platforms?.facebook?.id || null,
      fb_post_id: it.platforms?.facebook?.id || it.postIds?.facebook || null,
      text: it.post || it.message || it.text || it.caption || "",
      created_at: it.created || it.createdAt || it.scheduleDate || null,
      status: it.status || it.platforms?.facebook?.status || null,
      url: it.platforms?.facebook?.postUrl || it.postUrl || null,
      media: it.mediaUrls || it.media || [],
    }));

    return new Response(
      JSON.stringify({ ok: resp.ok, count: posts.length, posts, raw_status: resp.status, raw_error: resp.ok ? null : json }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

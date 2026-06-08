// Realtyz sync-comments — no Ayrshare read calls. Collects saved campaign
// native Facebook post ids from campaign_logs and fans out to the direct Meta
// Graph comments fetcher.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  let userId: string | null = null;
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token) {
    try {
      const { data } = await admin.auth.getUser(token);
      userId = data?.user?.id ?? null;
    } catch { /* ignore */ }
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  if (!userId && body?.user_id) userId = String(body.user_id);
  if (!userId) return json({ error: "user_id required" }, 401);

  const { data: rows, error } = await admin
    .from("campaign_logs")
    .select("channel, provider_message_id, provider_response")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return json({ success: false, error: error.message, targets: 0, dispatched: [] }, 200);

  const ids = new Set<string>();
  const add = (value: unknown) => {
    const id = typeof value === "string" ? value.trim() : "";
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(id)) ids.add(id);
  };

  for (const row of rows ?? []) {
    if (String((row as any).channel || "").toLowerCase() !== "facebook") continue;
    add((row as any).provider_message_id);
    const response: any = (row as any).provider_response ?? {};
    const flatPostIds: any[] = Array.isArray(response?.postIds) ? response.postIds : [];
    const wrappedPostIds: any[] = Array.isArray(response?.posts)
      ? response.posts.flatMap((post: any) => (Array.isArray(post?.postIds) ? post.postIds : []))
      : [];
    [...flatPostIds, ...wrappedPostIds]
      .filter((post: any) => String(post?.platform || "").toLowerCase() === "facebook")
      .forEach((post: any) => add(post?.id ?? post?.postId ?? post?.post_id));
  }

  const postIds = Array.from(ids).slice(0, 50);
  if (postIds.length > 0) {
    const p = fetch(`${SUPABASE_URL}/functions/v1/ayrshare-comments-fetch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, post_ids: postIds, platform: "facebook" }),
    }).catch((e) => console.error("[ayrshare-sync-comments] direct Meta fanout failed", e));
    // @ts-ignore Deno-specific background task API.
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p);
  }

  return json({ success: true, targets: postIds.length, api_errors: [], dispatched: [{ platform: "facebook", count: postIds.length }], queued: postIds.length > 0 }, 200);
});
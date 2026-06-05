// Realtyz cron dispatcher — scans recent Facebook campaign posts and asks
// ayrshare-comments-fetch to refresh comment data per post for each owner.
// Strict tenant isolation: every dispatched fetch carries the owning user_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE);

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await admin
    .from("campaign_logs")
    .select("user_id, campaign_name, provider_message_id, provider_response, created_at")
    .eq("channel", "facebook")
    .eq("is_archived", false)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const buckets = new Map<string, { user_id: string; campaign_name: string; ids: Set<string> }>();
  for (const row of rows ?? []) {
    const userId = String((row as any).user_id ?? "");
    const campaign = String((row as any).campaign_name ?? "");
    if (!userId) continue;
    const key = `${userId}::${campaign}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { user_id: userId, campaign_name: campaign, ids: new Set<string>() };
      buckets.set(key, bucket);
    }
    const provId = (row as any).provider_message_id;
    if (typeof provId === "string" && provId) bucket.ids.add(provId);
    const pr = (row as any).provider_response;
    if (pr && typeof pr === "object") {
      const candidates = [pr._fb_native_id, pr._ayrshare_id, pr.fbId, pr.postId, pr.refId];
      for (const c of candidates) if (typeof c === "string" && c) bucket.ids.add(c);
      if (Array.isArray(pr.postIds)) for (const c of pr.postIds) if (typeof c === "string" && c) bucket.ids.add(c);
    }
  }

  const targets = Array.from(buckets.values()).filter((b) => b.ids.size > 0);

  const results = await Promise.allSettled(
    targets.map((b) =>
      fetch(`${SUPABASE_URL}/functions/v1/ayrshare-comments-fetch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          post_ids: Array.from(b.ids),
          user_id: b.user_id,
          campaign_name: b.campaign_name,
        }),
      })
        .then((r) => r.json())
        .catch((e) => ({ ok: false, error: String(e) })),
    ),
  );

  return new Response(JSON.stringify({ ok: true, dispatched: targets.length, results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

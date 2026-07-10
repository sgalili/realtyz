// Realtyz cron dispatcher — scans recent Facebook campaign posts and asks
// ayrshare-comments-fetch to refresh comment data per post for each owner.
// Strict tenant isolation: every dispatched fetch carries the owning user_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const collectFacebookPostAliases = (root: any): string[] => {
  const ids = new Set<string>();
  const seen = new Set<any>();
  const add = (value: unknown) => {
    const s = typeof value === "string" ? value.trim() : "";
    if (!s) return;
    if (/^\d{5,}_\d{5,}$/.test(s) || /^pfbid[0-9A-Za-z]+$/.test(s)) ids.add(s);
    for (const m of s.matchAll(/pfbid[0-9A-Za-z]+/g)) if (m[0]) ids.add(m[0]);
    for (const m of s.matchAll(/facebook\.com\/share\/p\/([^/?#\s"'<]+)/gi)) {
      const token = decodeURIComponent(String(m[1] || "")).replace(/\/+$/, "").trim();
      if (/^[0-9A-Za-z_-]{5,}$/.test(token)) ids.add(token);
    }
  };
  const visit = (node: any) => {
    if (node == null || seen.has(node)) return;
    if (typeof node === "string") { add(node); return; }
    if (typeof node !== "object") return;
    seen.add(node);
    add(node.id); add(node.fbId); add(node.postId); add(node.post_id); add(node.refId);
    if (Array.isArray(node)) node.forEach(visit);
    else Object.values(node).forEach(visit);
  };
  visit(root);
  return Array.from(ids);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE);

  // Circuit breaker: skip ALL comment refresh work when Ayrshare is blocked.
  const { readCircuit, circuitOpenPayload } = await import("../_shared/ayrshare-circuit.ts");
  const _circuit = await readCircuit(admin);
  if (_circuit) {
    return new Response(
      JSON.stringify({ ok: false, dispatched: 0, ...circuitOpenPayload(_circuit) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await admin
    .from("campaign_logs")
    .select("user_id, campaign_name, provider_message_id, provider_response, created_at")
    .eq("channel", "facebook")
    .eq("is_archived", false)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(40); // hard cap to keep total Ayrshare calls per run well under quota

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
      collectFacebookPostAliases(pr).forEach((c) => bucket!.ids.add(c));
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

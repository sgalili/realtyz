// Realtyz meta-insights — direct Meta Graph API analytics (replaces
// ayrshare-analytics).
//
// Actions:
//   posts (default) → per-post likes/comments/shares/impressions for the
//                     workspace's recent campaign_logs; writes counters back.
//   page            → page-level impressions / reach / engagement / followers.
import { corsHeaders } from "../_shared/cors.ts";
import { humanizeMetaError, metaAdminClient, resolveMetaPage, resolveTenant } from "../_shared/metaPage.ts";
import {
  countTotal,
  fetchPageInsights,
  fetchPostMetrics,
  targetsFromLogs,
  writeCounts,
  ZERO_COUNTS,
} from "../_shared/metaInsights.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PLATFORM_MAP: Record<string, string> = {
  facebook: "facebook",
  instagram: "instagram",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const admin = metaAdminClient();
  const body = await req.json().catch(() => ({}));
  const { ownerId, callerId } = await resolveTenant(admin, req, body);
  if (!ownerId) return json({ error: "unauthorized" }, 401);

  const page = await resolveMetaPage(admin, ownerId);
  if (!page) {
    // Quiet no-op so dashboards never crash for workspaces without a Page.
    return json({ success: false, error: "no_page_linked", message: "לא מחובר עמוד פייסבוק לחשבון", results: [] });
  }

  const action = String(body?.action ?? "posts").toLowerCase();

  if (action === "page") {
    const days = Math.min(90, Math.max(1, Number(body?.days) || 28));
    const insights = await fetchPageInsights(page, days);
    if (!insights.ok) {
      return json({ success: false, error: "graph_error", message: humanizeMetaError(insights.error), ...insights });
    }
    return json({ success: true, ...insights });
  }

  const limit = Math.min(500, Math.max(1, Number(body?.limit) || 200));
  const requested = new Set<string>(
    [
      ...(Array.isArray(body?.post_ids) ? body.post_ids : []),
      body?.post_id,
      body?.provider_message_id,
      body?.external_post_id,
    ]
      .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      .map((v) => v.trim()),
  );

  const { data: rows, error } = await admin
    .from("campaign_logs")
    .select("id, channel, provider_message_id, provider_response, created_at")
    .eq("user_id", ownerId)
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return json({ error: error.message }, 500);

  const targets = targetsFromLogs(rows ?? [], PLATFORM_MAP, requested);

  const settled = await Promise.allSettled(
    targets.map(async (t) => {
      try {
        const res = await fetchPostMetrics(t.platform, t.nativePostId, page);
        if (!res.ok) {
          console.warn("[meta-insights] graph rejected", {
            id: t.id,
            platform: t.platform,
            post_id: t.nativePostId,
            status: res.status,
            message: (res.payload as any)?.error?.message,
          });
          return {
            id: t.id,
            ok: false,
            status: res.status,
            error: humanizeMetaError(res.payload, "שליפת מדדים מפייסבוק נכשלה"),
            native_post_id: t.nativePostId,
          };
        }
        const counts = res.counts ?? ZERO_COUNTS;
        const { error: updErr, nowIso } = await writeCounts(admin, t.id, ownerId, counts, t.nativePostId);
        if (updErr) return { id: t.id, ok: false, error: updErr.message, native_post_id: t.nativePostId };
        return {
          id: t.id,
          ok: true,
          counts,
          total: countTotal(counts),
          reach: res.reach ?? 0,
          engagement: res.engagement ?? 0,
          metrics_updated_at: nowIso,
          native_post_id: t.nativePostId,
          platform: t.platform,
        };
      } catch (err) {
        console.error("[meta-insights] target crashed", { id: t.id, error: String(err) });
        return { id: t.id, ok: false, error: String(err), native_post_id: t.nativePostId };
      }
    }),
  );

  const results = settled.map((s) => (s.status === "fulfilled" ? s.value : { ok: false, error: String((s as any).reason) }));
  return json({
    success: true,
    caller_id: callerId,
    owner_id: ownerId,
    page: { id: page.pageId, name: page.pageName },
    targets: targets.length,
    updated: results.filter((r: any) => r.ok).length,
    results,
  });
});

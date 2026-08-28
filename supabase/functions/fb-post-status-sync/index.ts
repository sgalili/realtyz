// Live validation of our campaign_logs rows against native Facebook Pages and
// Groups.
//
// For every row we hold a provider post id for (Page post or per-group post id
// stored on provider_response.group_results), we ask the Graph API whether the
// object still exists. Results:
//   - object exists          -> mark that group/page target as published
//   - object gone (code 100) -> the post was deleted on Facebook, so the row is
//                               removed from our feed (or the group target is
//                               flagged as failed/removed)
//   - transient/permission   -> left untouched (never destructive on doubt)
import { createClient } from "npm:@supabase/supabase-js@2";
import { GRAPH, resolveMetaPage, isMetaPermissionError } from "../_shared/metaPage.ts";
import { adminClient, resolveCaller } from "../_shared/fbPersonal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type GroupResult = {
  group_id?: string;
  ok?: boolean;
  post_id?: string;
  reason?: string;
  verified_at?: string;
  [k: string]: unknown;
};

/** true = object exists, false = definitively gone, null = unknown. */
async function objectExists(id: string, token: string): Promise<boolean | null> {
  try {
    const res = await fetch(
      `${GRAPH}/${encodeURIComponent(id)}?fields=id&access_token=${encodeURIComponent(token)}`,
    );
    const payload = await res.json().catch(() => ({}));
    if (res.ok && payload?.id) return true;
    if (isMetaPermissionError(payload)) return null;
    const code = Number(payload?.error?.code);
    // 100 = unknown object / already deleted, 803 = object does not exist.
    if (code === 100 || code === 803) return false;
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = adminClient();
  const caller = await resolveCaller(admin, req);
  if (!caller) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.filter((v: unknown) => typeof v === "string").slice(0, 60)
    : [];
  const owner = caller.workspaceOwnerId;

  const page = await resolveMetaPage(admin, owner);
  if (!page) {
    return new Response(JSON.stringify({ ok: true, skipped: "no_page_binding", checked: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let query = admin
    .from("campaign_logs")
    .select("id, status, provider_message_id, provider_response, group_ids, sent_at")
    .eq("workspace_owner_id", owner)
    .eq("channel", "facebook")
    .order("sent_at", { ascending: false })
    .limit(60);
  if (ids.length > 0) query = query.in("id", ids);

  const { data: rows, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let checked = 0;
  let deleted = 0;
  let updated = 0;

  for (const row of (rows ?? []) as any[]) {
    const results: GroupResult[] = Array.isArray(row?.provider_response?.group_results)
      ? [...row.provider_response.group_results]
      : [];
    let touchedRow = false;

    // 1) Per-group targets
    for (let i = 0; i < results.length; i++) {
      const postId = typeof results[i]?.post_id === "string" ? results[i].post_id! : "";
      if (!postId) continue;
      checked++;
      const exists = await objectExists(postId, page.token);
      if (exists === true && results[i].ok !== true) {
        results[i] = { ...results[i], ok: true, verified_at: new Date().toISOString() };
        touchedRow = true;
      } else if (exists === false && results[i].ok !== false) {
        results[i] = {
          ...results[i],
          ok: false,
          reason: "הפוסט נמחק בקבוצה",
          verified_at: new Date().toISOString(),
        };
        touchedRow = true;
      }
    }

    // 2) The Page / group post itself
    const mainId = typeof row?.provider_message_id === "string" ? row.provider_message_id : "";
    if (mainId && String(row.status || "").toLowerCase() === "sent") {
      checked++;
      const exists = await objectExists(mainId, page.token);
      if (exists === false) {
        // Deleted on Facebook: drop it from our feed entirely.
        const { error: delErr } = await admin.from("campaign_logs").delete().eq("id", row.id);
        if (!delErr) { deleted++; continue; }
      }
    }

    if (touchedRow) {
      const nextResponse = { ...(row.provider_response ?? {}), group_results: results };
      const anyOk = results.some((r) => r.ok === true);
      const patch: Record<string, unknown> = { provider_response: nextResponse };
      if (results.length > 0 && !anyOk) patch.status = "failed";
      const { error: upErr } = await admin.from("campaign_logs").update(patch).eq("id", row.id);
      if (!upErr) updated++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, checked, deleted, updated, page_id: page.pageId }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

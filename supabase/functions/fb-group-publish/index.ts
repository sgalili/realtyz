// fb-group-publish — publish a post to a Facebook group using the workspace's
// connected PERSONAL profile user token (official Graph API: POST /{group-id}/feed).
//
// Request:  { group_id, message, link?, image_url?, queue_id?, workspace_owner_id? }
// Returns:  { ok, post_id } | { ok: false, reason, code }
//
// Callable both from the browser (bearer = user JWT) and server-to-server from
// process-activity-queue (bearer = service role + explicit workspace_owner_id).
import { corsHeaders } from "../_shared/cors.ts";
import {
  adminClient,
  GRAPH,
  humanizeGraphError,
  loadConnection,
  resolveCaller,
} from "../_shared/fbPersonal.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({} as any));

    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const isService = bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    let workspaceOwnerId = String(body?.workspace_owner_id ?? "").trim();
    if (!isService) {
      const caller = await resolveCaller(admin, req);
      if (!caller) return json({ ok: false, reason: "unauthorized" }, 401);
      workspaceOwnerId = caller.workspaceOwnerId;
    }
    if (!workspaceOwnerId) return json({ ok: false, reason: "workspace_owner_id is required" }, 400);

    const rawGroupId = String(body?.group_id ?? "").trim();
    const groupId = rawGroupId.replace(/^manual:/, "");
    const message = String(body?.message ?? body?.text ?? "").trim();
    if (!groupId) return json({ ok: false, reason: "group_id is required" }, 400);
    if (!message) return json({ ok: false, reason: "message is required" }, 400);
    if (!/^\d+$/.test(groupId)) {
      return json(
        {
          ok: false,
          code: "unresolved_group",
          reason: "לקבוצה הזו אין מזהה מספרי מפייסבוק, ולכן היא דורשת פרסום ידני.",
        },
        200,
      );
    }

    const conn = await loadConnection(admin, workspaceOwnerId);
    if (!conn?.access_token) {
      return json(
        {
          ok: false,
          code: "not_connected",
          reason: "פרופיל הפייסבוק האישי לא מחובר עבור מרחב העבודה הזה.",
        },
        200,
      );
    }

    const form = new URLSearchParams({ message, access_token: conn.access_token });
    const link = String(body?.link ?? "").trim();
    const imageUrl = String(body?.image_url ?? "").trim();
    if (link) form.set("link", link);

    // With an image we publish through /photos so the media renders inline.
    const endpoint = imageUrl && !link
      ? `${GRAPH}/${groupId}/photos`
      : `${GRAPH}/${groupId}/feed`;
    if (imageUrl && !link) {
      form.delete("message");
      form.set("caption", message);
      form.set("url", imageUrl);
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: form.toString(),
    });
    const respBody = await res.json().catch(() => ({}));

    if (!res.ok || (!respBody?.id && !respBody?.post_id)) {
      const reason = humanizeGraphError(respBody);
      const code = String(respBody?.error?.code ?? res.status);
      console.error("[fb-group-publish] failed", groupId, code, respBody);
      await admin
        .from("fb_personal_connections")
        .update({ last_error: reason, updated_at: new Date().toISOString() })
        .eq("workspace_owner_id", workspaceOwnerId);
      return json({ ok: false, code, reason, raw: respBody?.error ?? null }, 200);
    }

    const postId = String(respBody.post_id ?? respBody.id);
    console.log("[fb-group-publish] published", groupId, postId);
    return json({ ok: true, post_id: postId });
  } catch (e) {
    console.error("[fb-group-publish] fatal", e);
    return json({ ok: false, reason: String((e as any)?.message ?? e) }, 500);
  }
});

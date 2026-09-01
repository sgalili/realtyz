// fb-group-publish — publish a post to a Facebook group using the workspace's
// connected PERSONAL profile user token (official Graph API: POST /{group-id}/feed).
//
// Request:  { group_id, message, link?, image_url?, queue_id?, workspace_owner_id? }
// Returns:  { ok, post_id } | { ok: false, reason, code }
//
// Callable both from the browser (bearer = user JWT) and server-to-server from
// process-activity-queue (bearer = service role + explicit workspace_owner_id).
import { corsHeaders } from "../_shared/cors.ts";
import { ensureMandatoryComment } from "../_shared/mandatoryComment.ts";
import {
  adminClient,
  canPublishToGroups,
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
    let groupId = rawGroupId.replace(/^(manual:|ext:)/, "");
    const message = String(body?.message ?? body?.text ?? "").trim();
    const groupUrl = String(body?.group_url ?? "").trim();
    const groupName = String(body?.group_name ?? body?.target_label ?? "").trim();
    if (!groupId && !groupUrl && !groupName) {
      return json({ ok: false, reason: "group_id is required" }, 400);
    }
    if (!message) return json({ ok: false, reason: "message is required" }, 400);

    // Never block on a missing numeric id: resolve it from the request URL or
    // from the stored group row (url / name), then let Graph decide.
    const numericFromUrl = (u: string) => u.match(/facebook\.com\/groups\/(\d+)/i)?.[1] ?? null;
    if (!/^\d+$/.test(groupId)) {
      const resolved = numericFromUrl(groupUrl) ?? null;
      if (resolved) groupId = resolved;
    }
    if (!/^\d+$/.test(groupId)) {
      try {
        const slug = groupId || groupName;
        const { data: rows } = await admin
          .from("fb_user_groups")
          .select("group_id, group_url, group_name")
          .eq("workspace_owner_id", workspaceOwnerId)
          .limit(200);
        const hit = (rows ?? []).find((r: any) =>
          (slug && (String(r.group_id) === slug || String(r.group_name ?? "") === slug)) ||
          (groupUrl && String(r.group_url ?? "") === groupUrl)
        );
        const candidate = String(hit?.group_id ?? "").replace(/^(manual:|ext:)/, "");
        if (/^\d+$/.test(candidate)) groupId = candidate;
        else {
          const fromRowUrl = numericFromUrl(String(hit?.group_url ?? ""));
          if (fromRowUrl) groupId = fromRowUrl;
        }
      } catch { /* best effort */ }
    }
    // Still no numeric id → attempt Graph with the vanity slug. If Graph
    // refuses we report it softly below; we never pre-block the publish.
    if (!groupId) groupId = String(numericFromUrl(groupUrl) ?? groupName);


    // Targeted publishing: a group the broker de-selected is never posted to,
    // and a group that already burned its daily quota is blocked until tomorrow.
    let dailyLimit: number | null = null;
    try {
      const { data: sel } = await admin
        .from("fb_user_groups")
        .select("is_selected, max_posts_per_day")
        .eq("workspace_owner_id", workspaceOwnerId)
        .eq("group_id", groupId)
        .maybeSingle();
      if (sel && (sel as any).is_selected === false) {
        return json(
          { ok: false, code: "group_not_selected", reason: "הקבוצה אינה מסומנת לפרסום בהגדרות החיבורים." },
          200,
        );
      }
      const cap = Number((sel as any)?.max_posts_per_day);
      dailyLimit = Number.isFinite(cap) && cap > 0 ? cap : null;
    } catch { /* selection lookup is best-effort */ }

    // Atomically claim one of today's slots for this group.
    let slotClaimed = false;
    try {
      const { data: allowed } = await admin.rpc("claim_fb_group_post_slot", {
        _owner: workspaceOwnerId,
        _group: groupId,
        _limit: dailyLimit,
      });
      slotClaimed = allowed !== false;
      if (allowed === false) {
        return json(
          {
            ok: false,
            code: "daily_limit_reached",
            reason: `הקבוצה הגיעה למקסימום הפרסומים היומי (${dailyLimit}). הפרסום ייחסם עד מחר.`,
          },
          200,
        );
      }
    } catch { /* counter unavailable — never block publishing on it */ }

    const releaseSlot = async () => {
      if (!slotClaimed) return;
      try {
        await admin.rpc("release_fb_group_post_slot", { _owner: workspaceOwnerId, _group: groupId });
      } catch { /* best effort */ }
    };


    const conn = await loadConnection(admin, workspaceOwnerId);
    if (!conn?.access_token) {
      await releaseSlot();
      return json(
        {
          ok: false,
          code: "not_connected",
          reason: "פרופיל הפייסבוק האישי לא מחובר עבור מרחב העבודה הזה.",
        },
        200,
      );
    }

    // The locally-cached scope list is frequently stale (Meta re-grants group
    // permissions without us re-reading them), so we NEVER pre-block on it.
    // We always attempt the real publish and let Graph decide — a genuine
    // permission problem still surfaces below with Meta's own wording.
    const scopeWarning = canPublishToGroups(conn.scopes)
      ? null
      : "ההרשאה publish_to_groups אינה מופיעה בחיבור המקומי — הפרסום נוסה מול פייסבוק בכל מקרה.";
    if (scopeWarning) console.warn("[fb-group-publish]", scopeWarning, groupId);

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
      await releaseSlot();
      await admin
        .from("fb_personal_connections")
        .update({ last_error: reason, updated_at: new Date().toISOString() })
        .eq("workspace_owner_id", workspaceOwnerId);
      return json({ ok: false, code, reason, raw: respBody?.error ?? null }, 200);
    }


    const postId = String(respBody.post_id ?? respBody.id);
    console.log("[fb-group-publish] published", groupId, postId);

    // HARD RULE: every group post gets the mandatory first comment with the
    // official contact tracking link. Failure here never fails the post.
    const firstComment = ensureMandatoryComment(body?.first_comment);
    let commentId: string | null = null;
    let commentError: string | null = null;
    // Both id shapes are tried ({group_id}_{object_id} and the bare id), each
    // with one retry, so a transient Graph hiccup never drops the comment.
    const targets = postId.includes("_") ? [postId] : [`${groupId}_${postId}`, postId];
    for (const target of targets) {
      for (let attempt = 0; attempt < 2 && !commentId; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1200));
        try {
          const cForm = new URLSearchParams({ message: firstComment, access_token: conn.access_token });
          const cRes = await fetch(`${GRAPH}/${target}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
            body: cForm.toString(),
          });
          const cBody = await cRes.json().catch(() => ({}));
          if (cRes.ok && cBody?.id) commentId = String(cBody.id);
          else {
            commentError = cBody?.error?.message ?? "first comment failed";
            console.error("[fb-group-publish] first comment failed", groupId, target, cBody);
          }
        } catch (cErr) {
          commentError = String(cErr);
          console.error("[fb-group-publish] first comment error", groupId, target, cErr);
        }
      }
      if (commentId) break;
    }

    return json({ ok: true, post_id: postId, comment_id: commentId });
  } catch (e) {
    console.error("[fb-group-publish] fatal", e);
    return json({ ok: false, reason: String((e as any)?.message ?? e) }, 500);
  }
});

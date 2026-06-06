// Realtyz comments-fetch — pulls live comments per post_id from Ayrshare,
// persists them into engagement_events (dedup by user_id + external_id), and
// dispatches each new comment into auto-engagement-process.
// Strict tenant isolation: user_id is required and scopes every DB query.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { AYR_BASE, resolveWorkspaceProfileKey } from "../_shared/ayrshare-helpers.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  try {
    const AYRSHARE_API_KEY = Deno.env.get("AYRSHARE_API_KEY");
    if (!AYRSHARE_API_KEY) return json({ error: "AYRSHARE_API_KEY not configured" }, 500);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let body: any = {};
    try {
      body = await req.json();
    } catch { /* noop */ }

    const postIds: string[] = Array.isArray(body?.post_ids)
      ? body.post_ids.filter((s: unknown): s is string => typeof s === "string" && s.length > 0)
      : typeof body?.post_id === "string"
      ? [body.post_id]
      : [];
    if (postIds.length === 0) return json({ error: "post_ids required" }, 400);

    // Resolve tenant. Body wins; otherwise extract from caller JWT.
    let userId: string | null = typeof body?.user_id === "string" ? body.user_id : null;
    if (!userId) {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      if (token) {
        try {
          const { data } = await admin.auth.getUser(token);
          userId = data?.user?.id ?? null;
        } catch { /* ignore */ }
      }
    }
    if (!userId) return json({ error: "user_id required" }, 401);

    const campaignName: string | null =
      typeof body?.campaign_name === "string" ? body.campaign_name : null;
    const platformHint =
      typeof body?.platform === "string" && body.platform.trim()
        ? body.platform.trim().toLowerCase()
        : "facebook";

    const { profileKey, refId } = await resolveWorkspaceProfileKey(admin);
    if (!profileKey) {
      return json({ error: "workspace ayrshare profile key missing" }, 400);
    }

    const pickStr = (...vals: unknown[]) => {
      for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
      return null;
    };
    const pickText = (item: any): string | null =>
      pickStr(item?.comment, item?.text, item?.message, item?.commentString, item?.textContent, item?.body);

    const results: Record<string, any[]> = {};
    const errors: Record<string, string> = {};

    await Promise.all(
      postIds.map(async (postId) => {
        try {
          const r = await fetch(
            `${AYR_BASE}/comments/${encodeURIComponent(postId)}?limit=100`,
            {
              headers: {
                Authorization: `Bearer ${AYRSHARE_API_KEY}`,
                "Profile-Key": profileKey,
                "Content-Type": "application/json",
              },
            },
          );
          const text = await r.text();
          let payload: any = {};
          try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }

          if (!r.ok) {
            errors[postId] = `HTTP ${r.status}: ${payload?.message ?? payload?.error ?? text.slice(0, 200)}`;
            results[postId] = [];
            return;
          }
          const arr: any[] = Array.isArray(payload)
            ? payload
            : payload?.comments || payload?.data?.comments || payload?.data || [];

          // Flatten one level of replies.
          const flat: any[] = [];
          const walk = (node: any, parent: string | null) => {
            if (!node || typeof node !== "object") return;
            (node as any).__parent_id = parent;
            flat.push(node);
            const kids = node.replies || node.children || [];
            if (Array.isArray(kids)) {
              const myId = pickStr(node.id, node.commentId, node.comment_id);
              for (const k of kids) walk(k, myId || parent);
            }
          };
          for (const c of arr) walk(c, null);
          results[postId] = flat;
        } catch (err) {
          errors[postId] = err instanceof Error ? err.message : String(err);
          results[postId] = [];
        }
      }),
    );

    // Persist into engagement_events (dedup by user_id + external_id).
    let persisted = 0;
    let skipped = 0;
    const toDispatch: Array<{
      external_id: string;
      external_post_id: string;
      sender_handle: string | null;
      inbound_text: string;
      platform: string;
      parent_id: string | null;
    }> = [];

    for (const [postId, list] of Object.entries(results)) {
      for (const [index, c] of (list ?? []).entries()) {
        const text = pickText(c) || "";
        if (!text.trim()) continue;
        const nativeId =
          pickStr(c?.id, c?.commentId, c?.comment_id, c?.platformCommentId) ??
          `${postId}_comment_${index}`;
        const sender = pickStr(
          c?.from?.name,
          c?.user?.name,
          c?.username,
          c?.sender,
          c?.author,
        );
        const parentId = typeof c?.__parent_id === "string" ? c.__parent_id : null;

        const { data: exists } = await admin
          .from("engagement_events")
          .select("id, status, ai_reply_text")
          .eq("user_id", userId)
          .eq("external_id", nativeId)
          .maybeSingle();

        if (exists?.id) {
          skipped += 1;
          // Re-dispatch only if still pending and no reply yet.
          if (!exists.ai_reply_text && exists.status !== "sent" && exists.status !== "pending_approval") {
            toDispatch.push({
              external_id: nativeId,
              external_post_id: postId,
              sender_handle: sender,
              inbound_text: text,
              platform: platformHint,
              parent_id: parentId,
            });
          }
          continue;
        }

        // Sanitize: keep ONLY flat scalar fields in metadata. The raw Ayrshare
        // payload can contain deeply nested objects (replies trees, user blobs,
        // attachment arrays) that occasionally violate jsonb size/shape
        // constraints and cause the insert to fail silently.
        const safeStr = (v: unknown, max = 500): string | null => {
          if (v === null || v === undefined) return null;
          const s = typeof v === "string" ? v : (() => {
            try { return JSON.stringify(v); } catch { return String(v); }
          })();
          const trimmed = s.trim();
          return trimmed ? trimmed.slice(0, max) : null;
        };
        const cleanMetadata = {
          source: "ayrshare_comments_fetch",
          campaign_name: safeStr(campaignName),
          profile_ref_id: safeStr(refId),
          parent_id: safeStr(parentId),
          native_created_at: safeStr(c?.created_time ?? c?.createdAt ?? c?.created_at ?? c?.timestamp),
          like_count: typeof c?.like_count === "number" ? c.like_count : null,
          permalink: safeStr(c?.permalink ?? c?.permalink_url ?? c?.url, 1000),
        };
        const cleanText = safeStr(text, 4000) ?? "";
        const cleanSender = safeStr(sender, 200);

        const payload = {
          user_id: userId,
          platform: platformHint,
          sender_handle: cleanSender,
          inbound_text: cleanText,
          external_id: nativeId,
          external_post_id: postId,
          status: "pending",
          ai_action: "queued",
          metadata: cleanMetadata,
        };

        try {
          const { error: insErr } = await admin.from("engagement_events").insert(payload);
          if (insErr) {
            console.error(
              "[ayrshare-comments-fetch] insert failed",
              JSON.stringify({
                message: insErr.message,
                code: (insErr as any).code,
                details: (insErr as any).details,
                hint: (insErr as any).hint,
                payload,
              }),
            );
            continue;
          }
          persisted += 1;
        } catch (writeErr) {
          console.error(
            "[ayrshare-comments-fetch] insert threw",
            JSON.stringify({
              error: writeErr instanceof Error ? writeErr.message : String(writeErr),
              payload,
            }),
          );
          continue;
        }
        toDispatch.push({
          external_id: nativeId,
          external_post_id: postId,
          sender_handle: cleanSender,
          inbound_text: cleanText,
          platform: platformHint,
          parent_id: parentId,
        });

      }
    }

    // Chain to auto-engagement-process (fire-and-forget).
    await Promise.all(
      toDispatch.map((d) =>
        fetch(`${SUPABASE_URL}/functions/v1/auto-engagement-process`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            platform: d.platform,
            event_type: "comment",
            inbound_text: d.inbound_text,
            external_id: d.external_id,
            external_post_id: d.external_post_id,
            sender_handle: d.sender_handle,
            sender_name: d.sender_handle,
            metadata: { parent_id: d.parent_id, source: "ayrshare_comments_fetch" },
          }),
        }).catch((e) => console.error("[ayrshare-comments-fetch] dispatch failed", e)),
      ),
    );

    return json({
      success: true,
      comments: results,
      errors,
      persisted,
      skipped,
      dispatched: toDispatch.length,
    });
  } catch (e) {
    console.error("[ayrshare-comments-fetch] error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

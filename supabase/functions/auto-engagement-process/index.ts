// Realtyz auto-engagement-process — for a new inbound comment/DM:
//  1. Run sentiment + KB-grounded analysis via Lovable AI.
//  2. Persist sentiment + draft into engagement_events (creating row if needed).
//  3. Dispatch private DM / auto-like only when the relevant auto-reply switch
//     and global AI autopilot switch are enabled.
//  4. If the workspace has auto_reply_positive/negative enabled AND sentiment
//     matches, ALSO auto-publish the public reply via meta-comments-sync.
//     Otherwise leave the row in `pending_approval` for the human queue.
// Strict tenant isolation: user_id is required and scopes every DB query.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sanitizeOutboundText, resolveWorkspaceProfileKey, likeNativeComment, resolveOwnPageIdentity, isSelfAuthoredComment } from "../_shared/ayrshare-helpers.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const AYRSHARE_API_KEY = Deno.env.get("AYRSHARE_API_KEY") ?? "";
const AYR_MESSAGES_URL = "https://api.ayrshare.com/api/messages";

type Analysis = {
  sentiment: "positive" | "neutral" | "negative";
  key_concerns: string[];
  reply: string;
  summary: string;
};

async function analyzeWithAI(input: {
  text: string;
  platform: string;
  event_type: string;
  sender_name?: string | null;
  kb_snippets?: string;
}): Promise<Analysis> {
  if (!LOVABLE_API_KEY) {
    return { sentiment: "neutral", key_concerns: [], reply: "", summary: "" };
  }
  const variantSeed = `${crypto.randomUUID()}-${Math.floor(Math.random()*1_000_000)}`;
  // SENTIMENT-ONLY classifier. Reply drafting is delegated to
  // `suggest-comment-reply`, which is property-locked to the exact post body
  // and its single linked listing. We intentionally do NOT pass workspace-wide
  // KB chunks here — that was the source of cross-property hallucinations
  // (mixing prices/locations/features from other listings into the reply).
  const system = `You classify an inbound social interaction. Return JSON ONLY:
{
  "sentiment": "positive" | "neutral" | "negative",
  "key_concerns": ["budget","location","timing",...],
  "summary": "<short English internal summary, max 1 sentence>"
}
Do not draft a reply. Do not include any property facts, prices, or addresses. entropy_seed=${variantSeed}`;

  const user = `Platform: ${input.platform}
Event: ${input.event_type}
Sender: ${input.sender_name ?? "unknown"}

Inbound text:
"""${input.text}"""`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.9,
    }),
  });
  if (!resp.ok) {
    return { sentiment: "neutral", key_concerns: [], reply: "", summary: "" };
  }
  const j = await resp.json();
  let parsed: any = {};
  try { parsed = JSON.parse(j?.choices?.[0]?.message?.content ?? "{}"); } catch { parsed = {}; }
  const sent = String(parsed.sentiment ?? "neutral").toLowerCase();
  return {
    sentiment: (["positive","negative","neutral"].includes(sent) ? sent : "neutral") as Analysis["sentiment"],
    key_concerns: Array.isArray(parsed.key_concerns) ? parsed.key_concerns.slice(0, 8) : [],
    reply: sanitizeOutboundText(parsed.reply ?? ""),
    summary: String(parsed.summary ?? "").slice(0, 500),
  };
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  try {
    const body = await req.json();
    const {
      user_id,
      lead_id,
      platform = "facebook",
      event_type = "comment",
      inbound_text = "",
      external_id,
      external_post_id,
      sender_handle,
      sender_name,
      metadata: incomingMetadata,
    } = body ?? {};

    if (!user_id) return json({ error: "user_id required" }, 400);
    if (!inbound_text || typeof inbound_text !== "string") {
      return json({ error: "inbound_text required" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE);

    const rawIncomingMetadata =
      incomingMetadata && typeof incomingMetadata === "object"
        ? (incomingMetadata as Record<string, unknown>)
        : {};

    // SENDER FIREWALL: refuse to react to comments authored by our own Page,
    // by an AI/system signature, or to events flagged is_ai_reply upstream.
    const ownPage = await resolveOwnPageIdentity(admin);
    const incomingSenderId =
      (rawIncomingMetadata as any)?.sender_id ??
      (rawIncomingMetadata as any)?.from_id ??
      (rawIncomingMetadata as any)?.fb_from_id ??
      null;
    const isAiReplyFlag = Boolean((rawIncomingMetadata as any)?.is_ai_reply);
    if (
      isAiReplyFlag ||
      isSelfAuthoredComment({
        fromId: incomingSenderId,
        fromName: sender_name ?? sender_handle ?? null,
        text: inbound_text,
        ownPageId: ownPage.pageId,
        ownPageName: ownPage.pageName,
      })
    ) {
      console.log("[auto-engagement-process] blocked self/ai-authored event", {
        external_id, incomingSenderId, sender_name, isAiReplyFlag,
      });
      return json({ ok: true, skipped: true, reason: "self_or_ai_authored" });
    }


    // Locate existing row (scope strictly to this user).
    let existing: any = null;
    if (external_id) {
      const { data } = await admin
        .from("engagement_events")
        .select("id, status, ai_action, ai_reply_text, metadata")
        .eq("user_id", user_id)
        .eq("external_id", external_id)
        .maybeSingle();
      existing = data ?? null;
      if (existing) {
        const alreadyProcessed =
          existing.status === "sent" ||
          existing.status === "replied" ||
          existing.status === "sending" ||
          existing.ai_action === "auto_reply";
        if (alreadyProcessed) {
          return json({ ok: true, skipped: true, reason: "already_processed", status: existing.status });
        }
      }
    }

    // Read workspace auto-flags from profiles row of this user.
    const { data: profileRow } = await admin
      .from("profiles")
      .select("auto_reply_positive, auto_reply_negative")
      .eq("id", user_id)
      .maybeSingle();
    const autoReplyPositive = Boolean(profileRow?.auto_reply_positive);
    const autoReplyNegative = Boolean(profileRow?.auto_reply_negative);
    const { data: globalAutopilot } = await admin.rpc("is_ai_autopilot_enabled", { _user_id: user_id });
    // The Campaigns Air Pilot UI exposes the sentiment switches. Older rows can
    // have those switches enabled while the global platform row is still absent,
    // so comments should autopilot when either visible switch permits it.
    const aiAutopilotEnabled = Boolean(globalAutopilot) || autoReplyPositive || autoReplyNegative;

    // STRICT POST→LISTING RESOLUTION. The reply MUST be scoped to the exact
    // post the commenter is responding to and ONLY the property linked to
    // that post — never a broad sweep of workspace listings or KB chunks.
    let campaignPostBody = "";
    let primaryListingId: string | null = null;
    let primaryListingType: "sale" | "rent" | null = null;
    if (external_post_id) {
      try {
        const { data: logRows } = await admin
          .from("campaign_logs")
          .select("message_body, provider_message_id, provider_response")
          .eq("user_id", user_id)
          .or(`provider_message_id.eq.${external_post_id},provider_response->>external_url.ilike.%${external_post_id}%`)
          .order("created_at", { ascending: false })
          .limit(10);
        const logRow = (logRows ?? []).find((row: any) => {
          if (String(row?.provider_message_id ?? "") === String(external_post_id)) return true;
          return JSON.stringify(row?.provider_response ?? {}).includes(String(external_post_id));
        }) ?? (logRows ?? [])[0];
        if (logRow?.message_body) campaignPostBody = String(logRow.message_body).slice(0, 4000);
      } catch { /* ignore */ }
    }

    // Resolve the SINGLE listing this post is about by scoring listing
    // identifiers (address > title > neighborhood) against the post body.
    if (campaignPostBody) {
      try {
        const { data: liveRows } = await admin
          .from("listings")
          .select("id,property_title,address,neighborhood,city,asking_price,features,status,is_published")
          .eq("user_id", user_id)
          .eq("status", "live")
          .eq("is_published", true)
          .limit(120);
        const body_l = campaignPostBody.toLowerCase();
        const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
        const scored = (liveRows ?? [])
          .map((row: any) => {
            const addr = norm(row?.address);
            const title = norm(row?.property_title);
            const hood = norm(row?.neighborhood);
            let s = 0;
            if (addr && addr.length >= 4 && body_l.includes(addr)) s += 100;
            if (title && title.length >= 4 && body_l.includes(title)) s += 60;
            if (hood && hood.length >= 4 && body_l.includes(hood)) s += 20;
            return { row, s };
          })
          .filter((e) => e.s > 0)
          .sort((a, b) => b.s - a.s);
        if (scored[0]?.row) {
          primaryListingId = scored[0].row.id as string;
          const feat = scored[0].row.features;
          const priceType = Number(scored[0].row.asking_price ?? 0) >= 100_000 ? "sale" : Number(scored[0].row.asking_price ?? 0) > 0 ? "rent" : null;
          if (priceType) primaryListingType = priceType;
          else if (feat && typeof feat === "object") {
            const lt = String((feat as any).listing_type ?? "").toLowerCase();
            if (lt === "rent" || lt === "sale") primaryListingType = lt as any;
          }
        }
      } catch { /* ignore */ }
    }

    // 1. AI analysis (sentiment only — reply text comes from the
    // property-locked suggest-comment-reply below).
    const analysis = await analyzeWithAI({
      text: inbound_text,
      platform,
      event_type,
      sender_name,
    });

    // Generate the actual public reply through the property-locked pipeline.
    // suggest-comment-reply enforces a STRICT LISTING PAYLOAD — no other
    // properties from the workspace can leak into the prompt.
    try {
      const sugBody: Record<string, unknown> = {
        user_id,
        platform,
        sender_handle: sender_handle ?? sender_name ?? "",
        inbound_text,
      };
      if (campaignPostBody) {
        sugBody.campaign_context = campaignPostBody;
        sugBody.campaign_post_body = campaignPostBody;
      }
      if (primaryListingId) sugBody.primary_listing_id = primaryListingId;
      if (primaryListingType) sugBody.listing_type = primaryListingType;
      const sugRes = await fetch(`${SUPABASE_URL}/functions/v1/suggest-comment-reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
        body: JSON.stringify(sugBody),
      });
      if (sugRes.ok) {
        const sj = await sugRes.json().catch(() => ({}));
        const pub = sanitizeOutboundText(String(sj?.public_comment ?? sj?.reply ?? "")).trim();
        if (pub) analysis.reply = pub;
      } else {
        console.warn("[auto-engagement-process] suggest-comment-reply failed", sugRes.status);
      }
    } catch (e) {
      console.error("[auto-engagement-process] suggest-comment-reply error", e);
    }

    const willAutoReply =
      aiAutopilotEnabled && (
        (analysis.sentiment === "positive" && autoReplyPositive) ||
        (analysis.sentiment === "negative" && autoReplyNegative)
      );

    const targetStatus = willAutoReply ? "sending" : "pending_approval";
    const aiAction = willAutoReply ? "auto_reply" : "draft";

    const mergedMetadata = {
      ...(existing?.metadata ?? {}),
      ...rawIncomingMetadata,
      analysis: {
        sentiment: analysis.sentiment,
        key_concerns: analysis.key_concerns,
        summary: analysis.summary,
      },
    };

    // 2. Persist row (insert if missing, else update).
    let rowId: string | null = existing?.id ?? null;
    if (rowId) {
      const { error: updErr } = await admin
        .from("engagement_events")
        .update({
          platform,
          sender_handle: sender_handle ?? sender_name ?? null,
          inbound_text,
          external_post_id: external_post_id ?? null,
          sentiment: analysis.sentiment,
          ai_reply_text: analysis.reply || null,
          ai_action: aiAction,
          status: targetStatus,
          lead_id: lead_id ?? null,
          metadata: mergedMetadata,
        })
        .eq("id", rowId)
        .eq("user_id", user_id);
      if (updErr) return json({ error: `update_failed: ${updErr.message}` }, 500);
    } else {
      const { data: ins, error: insErr } = await admin
        .from("engagement_events")
        .insert({
          user_id,
          lead_id: lead_id ?? null,
          platform,
          sender_handle: sender_handle ?? sender_name ?? null,
          inbound_text,
          external_id: external_id ?? null,
          external_post_id: external_post_id ?? null,
          sentiment: analysis.sentiment,
          ai_reply_text: analysis.reply || null,
          ai_action: aiAction,
          status: targetStatus,
          metadata: mergedMetadata,
        })
        .select("id")
        .single();
      if (insErr) return json({ error: `insert_failed: ${insErr.message}` }, 500);
      rowId = ins.id;
    }

    // 3. If auto-reply is enabled and we have a draft, publish public reply.
    let dispatch: any = null;
    if (willAutoReply && analysis.reply && rowId) {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/meta-comments-sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          event_id: rowId,
          user_id,
          text: analysis.reply,
          mode: "auto",
        }),
      });
      dispatch = await r.json().catch(() => ({ ok: false }));
    }

    // 4. DUAL FUNNEL + ALGO BOOST: run private DM and Auto-Like in parallel.
    //    DM moves the commenter into a 1:1 loop; Like signals engagement to the
    //    platform algorithm. Both are non-blocking — failures never break the
    //    public reply pipeline.
    let private_dm: any = null;
    let auto_like: any = null;
    if (willAutoReply && event_type === "comment" && external_id && AYRSHARE_API_KEY) {
      try {
        const { profileKey } = await resolveWorkspaceProfileKey(admin);
        if (profileKey) {
          const dmTask = analysis.reply
            ? fetch(AYR_MESSAGES_URL, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${AYRSHARE_API_KEY}`,
                  "Profile-Key": profileKey,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  platforms: [platform],
                  commentId: external_id,
                  message: analysis.reply,
                  searchPlatformId: true,
                }),
              }).then(async (r) => {
                const t = await r.text();
                let p: any; try { p = t ? JSON.parse(t) : { ok: r.ok }; } catch { p = { raw: t, ok: r.ok }; }
                return { status: r.status, response: p };
              }).catch((e) => ({ status: 0, response: { error: e instanceof Error ? e.message : String(e) } }))
            : Promise.resolve(null);

          const likeTask = likeNativeComment({
            apiKey: AYRSHARE_API_KEY,
            profileKey,
            platform,
            commentId: external_id,
          });

          const [dmResult, likeResult] = await Promise.all([dmTask, likeTask]);
          private_dm = dmResult?.response ?? null;
          auto_like = likeResult;
          if (!likeResult.ok) {
            console.warn("[auto-engagement-process] auto-like non-fatal failure", likeResult);
          }

          if (rowId) {
            await admin
              .from("engagement_events")
              .update({
                metadata: {
                  ...mergedMetadata,
                  ...(dmResult ? { private_dm: dmResult } : {}),
                  auto_like: likeResult,
                },
              })
              .eq("id", rowId)
              .eq("user_id", user_id);
          }
        }
      } catch (e) {
        console.error("[auto-engagement-process] dm/like dispatch failed", e);
        private_dm = private_dm ?? { error: e instanceof Error ? e.message : String(e) };
      }
    }


    return json({
      ok: true,
      row_id: rowId,
      sentiment: analysis.sentiment,
      auto_reply: willAutoReply,
      ai_autopilot_enabled: aiAutopilotEnabled,
      dispatch,
      private_dm,
      auto_like,
    });
  } catch (e) {
    console.error("[auto-engagement-process] error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

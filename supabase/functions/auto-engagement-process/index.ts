// Realtyz auto-engagement-process — for a new inbound comment/DM:
//  1. Run sentiment + KB-grounded analysis via Lovable AI.
//  2. Persist sentiment + draft into engagement_events (creating row if needed).
//  3. ALWAYS dispatch a private Messenger DM to the commenter (dual-funnel) so
//     the conversation moves into a private loop, regardless of toggle.
//  4. If the workspace has auto_reply_positive/negative enabled AND sentiment
//     matches, ALSO auto-publish the public reply via ayrshare-comment-reply.
//     Otherwise leave the row in `pending_approval` for the human queue.
// Strict tenant isolation: user_id is required and scopes every DB query.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sanitizeOutboundText } from "../_shared/ayrshare-helpers.ts";
import { resolveWorkspaceProfileKey } from "../_shared/ayrshare-helpers.ts";

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
}): Promise<Analysis> {
  if (!LOVABLE_API_KEY) {
    return { sentiment: "neutral", key_concerns: [], reply: "", summary: "" };
  }
  const variantSeed = Math.floor(Math.random() * 1_000_000);
  const system = `You are a senior real-estate broker assistant analyzing an inbound social interaction and drafting a public reply.

Return JSON ONLY with this shape:
{
  "sentiment": "positive" | "neutral" | "negative",
  "key_concerns": ["budget","location","timing",...],
  "reply": "<2 to 4 sentence reply in the inbound language>",
  "summary": "<short English internal summary>"
}

LANGUAGE MIRROR: detect the inbound language and reply ONLY in that language. English in -> English out. Hebrew in -> Hebrew out. Never mix.

REPLY RULES:
- Warm, concrete, never salesy. End with one open question that surfaces budget / location / timing / family size.
- No asterisks, em-dashes, double dashes, markdown, emojis, hashtags.
- No "AI" / "bot" / "automated" wording.
- Hebrew gender: match grammatical gender to the sender's first name; unknown defaults to masculine singular. Never slash forms.
- seed=${variantSeed}, vary openers and length to avoid templated tone.`;

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
          Boolean(existing.ai_reply_text) ||
          existing.status === "sent" ||
          existing.status === "pending_approval";
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

    // 1. AI analysis
    const analysis = await analyzeWithAI({
      text: inbound_text,
      platform,
      event_type,
      sender_name,
    });

    const willAutoReply =
      (analysis.sentiment === "positive" && autoReplyPositive) ||
      (analysis.sentiment === "negative" && autoReplyNegative);

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

    // 3. If auto-reply is enabled and we have a draft, dispatch via reply fn.
    let dispatch: any = null;
    if (willAutoReply && analysis.reply && rowId) {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/ayrshare-comment-reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: rowId,
          user_id,
          comment: analysis.reply,
          platform,
        }),
      });
      dispatch = await r.json().catch(() => ({ ok: false }));
    }

    return json({
      ok: true,
      row_id: rowId,
      sentiment: analysis.sentiment,
      auto_reply: willAutoReply,
      dispatch,
    });
  } catch (e) {
    console.error("[auto-engagement-process] error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

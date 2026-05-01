/**
 * trial-inbound-webhook
 * ──────────────────────
 * Receives inbound WhatsApp replies from voters that came from the System
 * WBA shared account (used by trial users). Looks up the trial user who
 * originally messaged the sender, asks Lovable AI for a contextual reply
 * using the user's knowledge base, and sends the reply back via the same
 * System WBA instance.
 *
 * Important: inbound replies do **not** consume the trial 100-message cap.
 *
 * This endpoint is public (no JWT) — it's called by the WBA provider's
 * webhook. Auth is enforced via a shared secret header.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { classifyEscalation } from "../_shared/guardrails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const SYSTEM_WBA_INSTANCE_ID = Deno.env.get("SYSTEM_WBA_INSTANCE_ID") ?? "";
const SYSTEM_WBA_TOKEN = Deno.env.get("SYSTEM_WBA_TOKEN") ?? "";
const WEBHOOK_SECRET = Deno.env.get("SYSTEM_WBA_WEBHOOK_SECRET") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  // Validate shared secret header.
  if (WEBHOOK_SECRET) {
    const provided = req.headers.get("x-webhook-secret") ?? "";
    if (provided !== WEBHOOK_SECRET) {
      return json({ error: "Forbidden" }, 403);
    }
  }

  try {
    const payload = await req.json();
    // GreenAPI shape: messageData.textMessageData.textMessage + senderData.sender
    const senderRaw: string =
      payload?.senderData?.sender ?? payload?.from ?? "";
    const text: string = payload?.messageData?.textMessageData?.textMessage ??
      payload?.text ?? "";

    if (!senderRaw || !text) {
      return json({ ignored: true, reason: "missing_sender_or_text" }, 200);
    }
    const senderPhone = senderRaw.replace(/\D+/g, "");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Find the most recent trial user who messaged this sender.
    const { data: lastOut } = await admin
      .from("trial_autopilot_messages")
      .select("user_id, lead_id")
      .eq("recipient_phone", senderPhone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastOut?.user_id) {
      return json({ ignored: true, reason: "no_matching_trial_user" }, 200);
    }
    const userId = lastOut.user_id;

    // Pull a few KB chunks for context (best-effort; ignore failure).
    let kbContext = "";
    try {
      const { data: kbResp } = await admin.functions.invoke("kb-query", {
        body: { user_id: userId, query: text, top_k: 3 },
      });
      kbContext = (kbResp?.context ?? "").slice(0, 2000);
    } catch { /* noop */ }

    // Generate AI response.
    let aiReply = "תודה רבה על הפנייה - נחזור אליך בהקדם.";
    if (LOVABLE_API_KEY) {
      try {
        const aiRes = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "system",
                  content:
                    "אתה עוזר תקשורת לקמפיין פוליטי. ענה בעברית, חם, מקצועי וקצר (עד 200 תווים). אל תזכיר 'Realtyz' או כל ספק חיצוני. ענה לבוחר באישיות. השתמש במידע ההקשר אם רלוונטי.",
                },
                {
                  role: "user",
                  content:
                    `הקשר ממאגר הידע (אם רלוונטי):\n${kbContext}\n\nתשובת בוחר:\n${text}`,
                },
              ],
              max_tokens: 200,
              temperature: 0.7,
            }),
          },
        );
        if (aiRes.ok) {
          const j = await aiRes.json();
          aiReply = j?.choices?.[0]?.message?.content?.trim() || aiReply;
        }
      } catch (e) {
        console.warn("AI generation failed:", (e as Error).message);
      }
    }

    // Log inbound (does NOT count against quota).
    await admin.from("trial_inbound_replies").insert({
      user_id: userId,
      lead_id: lastOut.lead_id,
      sender_phone: senderPhone,
      message_body: text.slice(0, 4000),
      ai_response: aiReply,
      ai_responded_at: new Date().toISOString(),
    });

    // Compliance: classify the lead's inbound text and fire an Escalation
    // Alert (WhatsApp ping to the human Agent) if it looks high-risk.
    try {
      const hit = classifyEscalation(text);
      if (hit) {
        await fetch(`${SUPABASE_URL}/functions/v1/escalation-alert`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            apikey: SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({
            override_user_id: userId,
            lead_id: lastOut.lead_id,
            lead_message: text.slice(0, 4000),
            category: hit.category,
            matched_keywords: hit.matched,
            severity: hit.severity,
            channel: "whatsapp_inbound",
          }),
        });
      }
    } catch (e) {
      console.warn("escalation classify/dispatch failed:", (e as Error).message);
    }


    // Send AI reply back via unified send-whatsapp gateway (clean, no branding).
    try {
      const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({
          phone_number: senderPhone,
          message: aiReply,
          tenant_id: userId,
        }),
      });
      if (!sendRes.ok) {
        const t = await sendRes.text();
        console.warn("send-whatsapp reply failed:", sendRes.status, t.slice(0, 300));
      }
    } catch (e) {
      console.warn("send-whatsapp reply exception:", (e as Error).message);
    }

    return json({ ok: true, replied: true, length: aiReply.length }, 200);
  } catch (e) {
    console.error("trial-inbound-webhook error:", e);
    return json({ error: "INTERNAL", message: (e as Error).message }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
